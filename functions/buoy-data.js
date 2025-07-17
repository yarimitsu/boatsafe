/**
 * Netlify Function: Buoy Data Proxy
 * Fetches NDBC buoy observations with CORS support
 */

// Valid Alaska buoy stations - security whitelist
const VALID_STATIONS = new Set([
  // Offshore Buoy Stations
  '46001', '46004', '46035', '46036', '46060', '46061', '46066', '46072', '46073', '46075',
  '46076', '46077', '46078', '46080', '46081', '46082', '46083', '46084', '46085', '46108',
  '46131', '46132', '46145', '46146', '46147', '46181', '46183', '46184', '46185', '46204',
  '46205', '46206', '46207', '46208', '46246', '46267', '46303', '46304',
  // Coastal/Land Stations
  'ABYA2', 'ADKA2', 'AJXA2', 'AKXA2', 'ANTA2', 'NMTA2', 'UNLA2', 'UQXA2'
]);

// Rate limiting store (in-memory)
const rateLimitStore = new Map();

function validateStationId(stationId) {
  if (!stationId || typeof stationId !== 'string') {
    return false;
  }
  
  return VALID_STATIONS.has(stationId.toUpperCase());
}

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxRequests = 120; // More generous for buoy data
  
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

async function fetchNDBCData(stationId) {
  const url = `https://www.ndbc.noaa.gov/data/realtime2/${stationId}.txt`;
  
  try {
    console.log(`Fetching buoy data from: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BoatSafe/1.0 (https://boatsafe.oceanbight.com contact@oceanbight.com)'
      }
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (response.ok) {
      const text = await response.text();
      console.log(`Got buoy data (${text.length} chars)`);
      
      // Parse and return structured data
      return parseNDBCData(text, stationId);
    } else {
      console.log(`Failed ${response.status}: ${response.statusText}`);
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(`Failed to fetch from ${url}:`, error.message);
    throw new Error('Unable to fetch buoy data from NDBC');
  }
}

function parseNDBCData(text, stationId) {
  const lines = text.split('\n').filter(line => line.trim());
  
  if (lines.length < 3) {
    throw new Error('Invalid NDBC data format');
  }
  
  const headerLine = lines[0];
  const unitLine = lines[1];
  const dataLine = lines[2]; // Most recent data
  
  const headers = headerLine.split(/\s+/);
  const units = unitLine.split(/\s+/);
  const values = dataLine.split(/\s+/);
  
  // Create data object
  const data = {};
  headers.forEach((header, index) => {
    data[header] = {
      value: values[index] || 'MM',
      unit: units[index] || ''
    };
  });
  
  // Parse timestamp
  const timestamp = parseTimestamp(data);
  
  return {
    stationId,
    timestamp: timestamp.toISOString(),
    data: data,
    parsed: timestamp,
    status: 'success'
  };
}

function parseTimestamp(data) {
  try {
    const year = parseInt(data.YY?.value || data.YYYY?.value) || new Date().getFullYear();
    const month = parseInt(data.MM?.value) || 1;
    const day = parseInt(data.DD?.value) || 1;
    const hour = parseInt(data.hh?.value) || 0;
    const minute = parseInt(data.mm?.value) || 0;
    
    return new Date(year, month - 1, day, hour, minute);
  } catch (error) {
    return new Date();
  }
}

exports.handler = async (event, context) => {
  console.log('Buoy function called with:', {
    method: event.httpMethod,
    path: event.path,
    headers: event.headers
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
    const pathMatch = event.path.match(/\/buoy-data\/([^\/]+)/);
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
          message: 'Station ID is required in path: /buoy-data/{stationId}',
          path: event.path
        })
      };
    }
    
    const stationId = pathMatch[1].toUpperCase();
    console.log('Extracted station ID:', stationId);
    
    // Validate station ID
    if (!validateStationId(stationId)) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          error: 'Invalid station ID',
          message: 'Station ID must be a valid Alaska buoy station'
        })
      };
    }
    
    // Fetch data from NDBC
    const data = await fetchNDBCData(stationId);
    
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300' // 5 minutes
      },
      body: JSON.stringify(data)
    };
    
  } catch (error) {
    console.error('Buoy proxy error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: 'Unable to fetch buoy data'
      })
    };
  }
};