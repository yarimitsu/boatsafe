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
      const stationCount = data.obData ? data.obData.length : 'unknown number of';
      console.log(`Got SEAK observations data with ${stationCount} stations`);
      
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
  // Handle the actual NOAA data structure: { ts: "timestamp", obData: [...] }
  if (!rawData || typeof rawData !== 'object') {
    throw new Error('Invalid data format received from NOAA');
  }
  
  const timestamp = rawData.ts || new Date().toISOString();
  const observationsArray = rawData.obData || rawData;
  
  if (!Array.isArray(observationsArray)) {
    throw new Error('Expected observations array not found in NOAA data');
  }
  
  // Process observations data from the obData array
  const observations = observationsArray.map(station => {
    if (!station || typeof station !== 'object') {
      return null;
    }
    
    const stationData = {};
    
    // Extract core station info using actual NOAA field names
    stationData.stationId = station.stn || station.stationId;
    stationData.stationName = station.stnName || station.stationName || stationData.stationId;
    
    // Map NOAA observation fields to our format with proper units
    const fieldMap = {
      'temp': { label: 'Temperature', unit: '°F' },
      'dewPt': { label: 'Dew Point', unit: '°F' },
      'rh': { label: 'Relative Humidity', unit: '%' },
      'windSpd': { label: 'Wind Speed', unit: 'mph' },
      'windDir': { label: 'Wind Direction', unit: '°' },
      'windGust': { label: 'Wind Gust', unit: 'mph' },
      'seaLevelPressure': { label: 'Sea Level Pressure', unit: 'mb' },
      'altimeter': { label: 'Pressure', unit: 'inHg' },
      'visibility': { label: 'Visibility', unit: 'mi' },
      'ceiling': { label: 'Ceiling', unit: 'ft' },
      'weather': { label: 'Weather Conditions', unit: '' },
      'sky': { label: 'Sky Conditions', unit: '' },
      'precip': { label: 'Precipitation', unit: 'in' }
    };
    
    // Process each observation field
    Object.keys(fieldMap).forEach(noaaField => {
      const fieldInfo = fieldMap[noaaField];
      const value = station[noaaField];
      
      // Only include non-empty, non-null, non-dash values
      if (value !== null && value !== undefined && value !== '-' && value !== '' && value !== 'M') {
        // Convert numeric strings to numbers where appropriate
        let processedValue = value;
        if (typeof value === 'string' && !isNaN(parseFloat(value)) && isFinite(value)) {
          processedValue = parseFloat(value);
        }
        
        stationData[fieldInfo.label] = {
          value: processedValue,
          unit: fieldInfo.unit
        };
      }
    });
    
    // Only return stations with valid ID/name and at least some data
    if ((stationData.stationId || stationData.stationName) && Object.keys(stationData).length > 2) {
      return stationData;
    }
    
    return null;
  }).filter(station => station !== null);
  
  return {
    timestamp: timestamp,
    updated: new Date().toISOString(),
    count: observations.length,
    observations: observations,
    status: 'success',
    source: 'NOAA SEAK Marine Observations'
  };
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