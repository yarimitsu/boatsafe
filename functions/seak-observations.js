/**
 * Netlify Function: SEAK Observations Proxy
 * Security-first proxy for NOAA SEAK Marine Observations API
 */

// Rate limiting store (in-memory)
const rateLimitStore = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxRequests = 120; // Generous for observations data
  
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

async function fetchSEAKObservations() {
  // Use the SEAK observations data source
  const url = 'https://www.weather.gov/source/ajk/obs/roundup/allSEAKobs.json';
  
  try {
    console.log(`Fetching SEAK observations from: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BoatSafe/1.0 (https://boatsafe.oceanbight.com contact@oceanbight.com)',
        'Accept': 'application/json'
      }
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`Got SEAK observations data with ${data.length} stations`);
      
      // Process and return structured data
      return processSEAKData(data);
    } else {
      console.log(`Failed ${response.status}: ${response.statusText}`);
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(`Failed to fetch from ${url}:`, error.message);
    throw new Error('Unable to fetch SEAK observations data');
  }
}

function processSEAKData(rawData) {
  // Extract timestamp (first element is typically the timestamp)
  const timestamp = rawData[0] || new Date().toISOString();
  
  // Process observations data (skip timestamp element)
  const observations = rawData.slice(1).map(station => {
    // Convert the station data to a more structured format
    const stationData = {};
    
    // Extract station info
    Object.keys(station).forEach(key => {
      const value = station[key];
      
      // Handle special fields
      if (key === 'Station Name' || key === 'station') {
        stationData.stationName = value;
      } else if (key === 'StationId' || key === 'station_id') {
        stationData.stationId = value;
      } else if (value !== null && value !== undefined && value !== '-' && value !== '') {
        // Store observation data
        stationData[key] = {
          value: value,
          unit: getFieldUnit(key)
        };
      }
    });
    
    // Ensure we have required fields
    if (!stationData.stationId && station.StationId) {
      stationData.stationId = station.StationId;
    }
    if (!stationData.stationName && station['Station Name']) {
      stationData.stationName = station['Station Name'];
    }
    
    return stationData;
  }).filter(station => station.stationId || station.stationName);
  
  return {
    timestamp: timestamp,
    updated: new Date().toISOString(),
    count: observations.length,
    observations: observations,
    status: 'success'
  };
}

function getFieldUnit(fieldName) {
  const unitMap = {
    'Temperature': '°F',
    'Temp': '°F',
    'Dew Point': '°F',
    'DewPoint': '°F',
    'Relative Humidity': '%',
    'RH': '%',
    'Wind Speed': 'mph',
    'WindSpeed': 'mph',
    'Wind Direction': '°',
    'WindDir': '°',
    'Gust Speed': 'mph',
    'GustSpeed': 'mph',
    'Pressure': 'mb',
    'SeaLevelPressure': 'mb',
    'Visibility': 'mi',
    'Ceiling': 'ft'
  };
  
  return unitMap[fieldName] || '';
}

exports.handler = async (event, context) => {
  console.log('SEAK observations function called with:', {
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
    
    // Fetch data from NOAA
    const data = await fetchSEAKObservations();
    
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=600' // 10 minutes
      },
      body: JSON.stringify(data)
    };
    
  } catch (error) {
    console.error('SEAK observations proxy error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: 'Unable to fetch SEAK observations data'
      })
    };
  }
};