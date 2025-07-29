/**
 * Netlify Function: Coastal Forecast Proxy
 * Security-first proxy for NOAA Coastal Forecast API
 */

// Valid Alaska coastal forecast zones - security whitelist
const VALID_ZONES = new Set([
  'AKZ317', 'AKZ318', 'AKZ319', 'AKZ320', 'AKZ321', 'AKZ322', 
  'AKZ323', 'AKZ324', 'AKZ325', 'AKZ326', 'AKZ327', 'AKZ328', 
  'AKZ329', 'AKZ330', 'AKZ331', 'AKZ332'
]);

// Rate limiting store (in-memory for simplicity)
const rateLimitStore = new Map();

function validateZoneId(zoneId) {
  if (!zoneId || typeof zoneId !== 'string') {
    return false;
  }
  
  const upperZoneId = zoneId.toUpperCase();
  return VALID_ZONES.has(upperZoneId);
}

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxRequests = 60;
  
  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  const userData = rateLimitStore.get(ip);
  
  if (now > userData.resetTime) {
    // Reset the window
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

// NOAA Weather API base URL for zone forecasts
const NOAA_API_BASE = 'https://api.weather.gov/zones/forecast';

// Zone names mapping
const ZONE_NAMES = {
  'AKZ317': 'Northern Prince of Wales Island',
  'AKZ318': 'Central Prince of Wales Island', 
  'AKZ319': 'Southern Prince of Wales Island',
  'AKZ320': 'Misty Fjords',
  'AKZ321': 'Coastal Yakutat',
  'AKZ322': 'North Central Gulf Coast', 
  'AKZ323': 'South Central Gulf Coast',
  'AKZ324': 'Kodiak Island',
  'AKZ325': 'Alaska Peninsula Coast',
  'AKZ326': 'Bristol Bay Coast',
  'AKZ327': 'Lower Kuskokwim Valley',
  'AKZ328': 'Middle Kuskokwim Valley',
  'AKZ329': 'Upper Kuskokwim Valley',
  'AKZ330': 'Western Alaska Coast',
  'AKZ331': 'Northwest Arctic Coast',
  'AKZ332': 'North Slope Coast'
};

async function fetchNOAACoastalData(zoneId) {
  const url = `${NOAA_API_BASE}/${zoneId}/forecast`;
  
  try {
    console.log(`Fetching coastal forecast from NOAA API: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BoatSafe/1.0 (https://boatsafe.oceanbight.com contact@oceanbight.com)',
        'Accept': 'application/json'
      }
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`Got coastal forecast data for ${zoneId}`);
      
      // NOAA API returns data in a different format than the raw text
      if (data.properties && data.properties.periods) {
        return {
          properties: {
            updated: data.properties.updated || new Date().toISOString(),
            periods: data.properties.periods.map(period => ({
              name: period.name || 'Coastal Forecast',
              detailedForecast: period.detailedForecast || period.forecast || 'No detailed forecast available',
              shortForecast: period.shortForecast || `Coastal conditions for ${ZONE_NAMES[zoneId.toUpperCase()]}`
            }))
          }
        };
      } else {
        throw new Error('Invalid response structure from NOAA API');
      }
    } else {
      console.log(`Failed ${response.status}: ${response.statusText}`);
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(`Failed to fetch from ${url}:`, error.message);
    throw new Error('Unable to fetch coastal forecast data from NOAA API');
  }
}


exports.handler = async (event, context) => {
  console.log('Coastal forecast function called with:', {
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
    
    // Extract zone ID from path
    console.log('Extracting zone ID from path:', event.path);
    const pathMatch = event.path.match(/\/coastal-forecast\/([^\/]+)/);
    if (!pathMatch) {
      console.log('No zone ID found in path');
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          error: 'Invalid request',
          message: 'Zone ID is required in path: /coastal-forecast/{zoneId}',
          path: event.path
        })
      };
    }
    
    const zoneId = pathMatch[1].toUpperCase();
    console.log('Extracted zone ID:', zoneId);
    
    // Validate zone ID
    if (!validateZoneId(zoneId)) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          error: 'Invalid zone ID',
          message: 'Zone ID must be a valid Alaska coastal forecast zone (AKZ317-AKZ332)'
        })
      };
    }
    
    // Fetch data from NOAA
    const data = await fetchNOAACoastalData(zoneId);
    
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800' // 30 minutes
      },
      body: JSON.stringify(data)
    };
    
  } catch (error) {
    console.error('Coastal forecast proxy error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: 'Unable to fetch coastal forecast data'
      })
    };
  }
};