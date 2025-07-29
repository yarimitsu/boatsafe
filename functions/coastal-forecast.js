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

// NOAA raw text forecast URL for Alaska Regional Headquarters land zone forecasts
const ALASKA_LAND_FORECAST_URL = 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak61.parh.zfp.arh.txt';

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
  try {
    console.log(`Fetching Alaska land forecast from: ${ALASKA_LAND_FORECAST_URL}`);
    const response = await fetch(ALASKA_LAND_FORECAST_URL, {
      headers: {
        'User-Agent': 'BoatSafe/1.0 (https://boatsafe.oceanbight.com contact@oceanbight.com)'
      }
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (response.ok) {
      const text = await response.text();
      console.log(`Got Alaska forecast text (${text.length} chars)`);
      
      // Extract the specific zone forecast from the raw text
      const zoneForecast = extractZoneFromText(text, zoneId);
      
      if (!zoneForecast) {
        throw new Error(`Forecast for zone ${zoneId} not found in Alaska land forecast data`);
      }
      
      // Extract issued time from forecast text
      let issuedTime = null;
      const issuedMatch = text.match(/ISSUED.*?(\d{1,2}:\d{2}\s*(AM|PM)\s*(AKDT|AKST).*?)/i) ||
                         text.match(/(\d{1,2}\/\d{1,2}\/\d{4}.*?\d{1,2}:\d{2}\s*(AM|PM))/i);
      if (issuedMatch) {
        issuedTime = issuedMatch[1] || issuedMatch[0];
      }
      
      // Convert to JSON format similar to other forecast widgets
      return {
        properties: {
          updated: new Date().toISOString(),
          periods: [{
            name: 'Coastal Forecast',
            detailedForecast: zoneForecast,
            shortForecast: `Coastal conditions for ${ZONE_NAMES[zoneId.toUpperCase()]}`,
            issueTime: issuedTime
          }]
        }
      };
    } else {
      console.log(`Failed ${response.status}: ${response.statusText}`);
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(`Failed to fetch from ${ALASKA_LAND_FORECAST_URL}:`, error.message);
    throw new Error('Unable to fetch Alaska land forecast data from NOAA');
  }
}

function extractZoneFromText(text, zoneId) {
  try {
    // Look for the zone ID in the text
    const lines = text.split('\n');
    let zoneStartIndex = -1;
    let zoneEndIndex = -1;
    
    // Find the start of the zone section
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(zoneId)) {
        zoneStartIndex = i;
        break;
      }
    }
    
    if (zoneStartIndex === -1) {
      console.log(`Zone ${zoneId} not found in forecast text`);
      return null;
    }
    
    // Find the end of the zone section (next AKZ zone or $$)
    for (let i = zoneStartIndex + 1; i < lines.length; i++) {
      if (lines[i].match(/AKZ\d{3}/) || lines[i].includes('$$')) {
        zoneEndIndex = i;
        break;
      }
    }
    
    if (zoneEndIndex === -1) {
      zoneEndIndex = lines.length;
    }
    
    // Extract the zone forecast text
    const zoneLines = lines.slice(zoneStartIndex, zoneEndIndex);
    const zoneForecast = zoneLines.join('\n').trim();
    
    console.log(`Extracted forecast for ${zoneId} (${zoneForecast.length} chars)`);
    return zoneForecast;
    
  } catch (error) {
    console.error(`Error extracting zone ${zoneId}:`, error);
    return null;
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