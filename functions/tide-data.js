/**
 * Netlify Function: Tide Data Proxy
 * Security-first proxy for NOAA Tides & Currents API
 */

// Dynamic loading of Alaska tide stations from comprehensive dataset
let VALID_STATIONS = null;
const fs = require('fs');
const path = require('path');

async function loadValidStations() {
  if (VALID_STATIONS !== null) {
    return VALID_STATIONS;
  }
  
  try {
    const stationsPath = path.join(__dirname, '../src/data/tide-stations.json');
    const stationsData = JSON.parse(fs.readFileSync(stationsPath, 'utf8'));
    
    // Filter to Alaska stations only for security whitelist
    VALID_STATIONS = new Set();
    Object.entries(stationsData).forEach(([id, station]) => {
      if (station.region === 'Alaska') {
        VALID_STATIONS.add(id);
      }
    });
    
    console.log(`Loaded ${VALID_STATIONS.size} Alaska tide stations for validation`);
    return VALID_STATIONS;
  } catch (error) {
    console.error('Failed to load tide stations, using fallback set:', error);
    // Fallback to minimal verified set
    VALID_STATIONS = new Set([
      '9452210', // Juneau, AK
      '9452400', // Skagway, Taiya Inlet, AK
      '9450460', // Ketchikan, Tongass Narrows, AK
      '9455920', // Anchorage, AK
      '9455500', // Seward, AK
      '9455760', // Nikiski, AK
      '9454050', // Valdez, AK
      '9454240', // Cordova, AK
      '9453220', // Kodiak Island, AK
      '9459450', // Homer, AK
      '9462450', // Nikolski, AK
    ]);
    return VALID_STATIONS;
  }
}

// Rate limiting store (in-memory)
const rateLimitStore = new Map();

async function validateStationId(stationId) {
  if (!stationId || typeof stationId !== 'string') {
    return false;
  }
  
  const validStations = await loadValidStations();
  return validStations.has(stationId);
}

function validateDateString(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    return false;
  }
  
  // Should be in format YYYYMMDD
  const dateRegex = /^\d{8}$/;
  if (!dateRegex.test(dateStr)) {
    return false;
  }
  
  // Check if it's a valid date
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6));
  const day = parseInt(dateStr.substring(6, 8));
  
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && 
         date.getMonth() === month - 1 && 
         date.getDate() === day;
}

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxRequests = 100; // Allow more requests for tide data
  
  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  const userData = rateLimitStore.get(ip);
  
  if (now > userData.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (userData.count >= maxRequests) {
    return false;
  }
  
  userData.count++;
  return true;
}

function getClientIp(event) {
  return event.headers['x-forwarded-for'] || 
         event.headers['x-real-ip'] || 
         event.connection?.remoteAddress || 
         '127.0.0.1';
}

async function fetchNOAATideData(stationId, beginDate, endDate) {
  // Construct NOAA API URL
  const baseUrl = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
  const params = new URLSearchParams({
    begin_date: beginDate,
    end_date: endDate,
    station: stationId,
    product: 'predictions',
    datum: 'MLLW',
    time_zone: 'lst_ldt',
    units: 'english',
    format: 'json',
    interval: 'hilo' // Get high/low predictions only
  });
  
  const url = `${baseUrl}?${params.toString()}`;
  
  try {
    console.log(`Fetching tide data from: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BoatSafe/1.0 (https://boatsafe.oceanbight.com contact@oceanbight.com)'
      }
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`Got tide data:`, data);
      return data;
    } else {
      const errorText = await response.text();
      console.log(`Failed ${response.status}: ${response.statusText}`, errorText);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Failed to fetch from ${url}:`, error.message);
    throw new Error('Unable to fetch tide data from NOAA');
  }
}

function formatDateForAPI(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function getDateFromParam(dateParam) {
  if (!dateParam) {
    return new Date();
  }
  
  if (!validateDateString(dateParam)) {
    throw new Error('Invalid date format. Use YYYYMMDD');
  }
  
  const year = parseInt(dateParam.substring(0, 4));
  const month = parseInt(dateParam.substring(4, 6));
  const day = parseInt(dateParam.substring(6, 8));
  
  return new Date(year, month - 1, day);
}

exports.handler = async (event, context) => {
  console.log('Tide function called with:', {
    method: event.httpMethod,
    path: event.path,
    queryStringParameters: event.queryStringParameters
  });

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400'
      },
      body: ''
    };
  }
  
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }
  
  try {
    const clientIp = getClientIp(event);
    
    // Rate limiting
    if (!checkRateLimit(clientIp)) {
      return {
        statusCode: 429,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          error: 'Rate limit exceeded',
          message: 'Too many requests. Please try again later.'
        })
      };
    }
    
    // Extract station ID from path
    console.log('Extracting station ID from path:', event.path);
    const pathMatch = event.path.match(/\/tide-data\/([^\/]+)/);
    if (!pathMatch) {
      console.log('No station ID found in path');
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          error: 'Invalid request',
          message: 'Station ID is required in path: /tide-data/{stationId}',
          path: event.path
        })
      };
    }
    
    const stationId = pathMatch[1];
    console.log('Extracted station ID:', stationId);
    
    // Validate station ID
    if (!(await validateStationId(stationId))) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          error: 'Invalid station ID',
          message: 'Station ID must be a valid Alaska tide station'
        })
      };
    }
    
    // Get date parameter or use today
    const dateParam = event.queryStringParameters?.date;
    let targetDate;
    
    try {
      targetDate = getDateFromParam(dateParam);
    } catch (error) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          error: 'Invalid date parameter',
          message: error.message
        })
      };
    }
    
    // Format dates for API
    const beginDate = formatDateForAPI(targetDate);
    const endDate = beginDate; // Same day
    
    console.log(`Fetching tide data for station ${stationId} on ${beginDate}`);
    
    // Fetch data from NOAA
    const data = await fetchNOAATideData(stationId, beginDate, endDate);
    
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800' // 30 minutes
      },
      body: JSON.stringify({
        stationId,
        date: beginDate,
        data: data,
        status: 'success'
      })
    };
    
  } catch (error) {
    console.error('Tide proxy error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: 'Unable to fetch tide data'
      })
    };
  }
};