/**
 * Netlify Function: Marine Forecast Proxy
 * Security-first proxy for NOAA Marine Forecast API
 */

// Valid Alaska marine zones - security whitelist
const VALID_ZONES = new Set([
  // SE Inner Coastal Waters
  'PKZ098', 'PKZ011', 'PKZ012', 'PKZ013', 'PKZ021', 'PKZ022', 'PKZ031', 'PKZ032', 'PKZ033', 'PKZ034', 'PKZ035', 'PKZ036',
  // SE Outside Coastal Waters
  'PKZ641', 'PKZ661', 'PKZ642', 'PKZ662', 'PKZ643', 'PKZ663', 'PKZ644', 'PKZ664', 'PKZ651', 'PKZ671', 'PKZ652', 'PKZ672',
  // Yakutat Bay
  'PKZ053',
  // North Gulf Coast Kodiak and Cook Inlet
  'PKZ197', 'PKZ710', 'PKZ711', 'PKZ712', 'PKZ715', 'PKZ716', 'PKZ714', 'PKZ724', 'PKZ725', 'PKZ726', 'PKZ720', 'PKZ721', 'PKZ722', 'PKZ723', 'PKZ730', 'PKZ731', 'PKZ733', 'PKZ732', 'PKZ734', 'PKZ736', 'PKZ737', 'PKZ738', 'PKZ742', 'PKZ740', 'PKZ741',
  // Southwest AK and the Aleutians
  'PKZ750', 'PKZ751', 'PKZ752', 'PKZ753', 'PKZ754', 'PKZ755', 'PKZ756', 'PKZ757', 'PKZ758', 'PKZ759', 'PKZ770', 'PKZ772', 'PKZ771', 'PKZ773', 'PKZ774', 'PKZ775', 'PKZ776', 'PKZ777', 'PKZ778', 'PKZ780', 'PKZ781', 'PKZ782'
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

// Zone to forecast URL mapping
const ZONE_TO_FORECAST_URL = {
  // SE Inner Coastal Waters
  'PKZ098': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pajk.cwf.ajk.txt',
  'PKZ011': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pajk.cwf.ajk.txt',
  'PKZ012': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pajk.cwf.ajk.txt',
  'PKZ013': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pajk.cwf.ajk.txt',
  'PKZ021': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pajk.cwf.ajk.txt',
  'PKZ022': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pajk.cwf.ajk.txt',
  'PKZ031': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pajk.cwf.ajk.txt',
  'PKZ032': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pajk.cwf.ajk.txt',
  'PKZ033': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pajk.cwf.ajk.txt',
  'PKZ034': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pajk.cwf.ajk.txt',
  'PKZ035': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pajk.cwf.ajk.txt',
  'PKZ036': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pajk.cwf.ajk.txt',
  // SE Outside Coastal Waters
  'PKZ641': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pajk.cwf.aeg.txt',
  'PKZ661': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pajk.cwf.aeg.txt',
  'PKZ642': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pajk.cwf.aeg.txt',
  'PKZ662': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pajk.cwf.aeg.txt',
  'PKZ643': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pajk.cwf.aeg.txt',
  'PKZ663': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pajk.cwf.aeg.txt',
  'PKZ644': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pajk.cwf.aeg.txt',
  'PKZ664': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pajk.cwf.aeg.txt',
  'PKZ651': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pajk.cwf.aeg.txt',
  'PKZ671': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pajk.cwf.aeg.txt',
  'PKZ652': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pajk.cwf.aeg.txt',
  'PKZ672': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pajk.cwf.aeg.txt',
  // Yakutat Bay
  'PKZ053': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak53.pajk.cwf.yak.txt',
  // North Gulf Coast Kodiak and Cook Inlet
  'PKZ197': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafc.cwf.aer.txt',
  'PKZ710': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafc.cwf.aer.txt',
  'PKZ711': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafc.cwf.aer.txt',
  'PKZ712': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafc.cwf.aer.txt',
  'PKZ715': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafc.cwf.aer.txt',
  'PKZ716': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafc.cwf.aer.txt',
  'PKZ714': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafc.cwf.aer.txt',
  'PKZ724': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafc.cwf.aer.txt',
  'PKZ725': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafc.cwf.aer.txt',
  'PKZ726': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafc.cwf.aer.txt',
  'PKZ720': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafc.cwf.aer.txt',
  'PKZ721': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafc.cwf.aer.txt',
  'PKZ722': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafc.cwf.aer.txt',
  'PKZ723': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafc.cwf.aer.txt',
  'PKZ730': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafc.cwf.aer.txt',
  'PKZ731': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafc.cwf.aer.txt',
  'PKZ733': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafc.cwf.aer.txt',
  'PKZ732': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafc.cwf.aer.txt',
  'PKZ734': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafc.cwf.aer.txt',
  'PKZ736': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafc.cwf.aer.txt',
  'PKZ737': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafc.cwf.aer.txt',
  'PKZ738': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafc.cwf.aer.txt',
  'PKZ742': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafc.cwf.aer.txt',
  'PKZ740': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafc.cwf.aer.txt',
  'PKZ741': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafc.cwf.aer.txt',
  // Southwest AK and the Aleutians
  'PKZ750': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pafc.cwf.alu.txt',
  'PKZ751': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pafc.cwf.alu.txt',
  'PKZ752': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pafc.cwf.alu.txt',
  'PKZ753': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pafc.cwf.alu.txt',
  'PKZ754': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pafc.cwf.alu.txt',
  'PKZ755': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pafc.cwf.alu.txt',
  'PKZ756': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pafc.cwf.alu.txt',
  'PKZ757': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pafc.cwf.alu.txt',
  'PKZ758': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pafc.cwf.alu.txt',
  'PKZ759': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pafc.cwf.alu.txt',
  'PKZ770': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pafc.cwf.alu.txt',
  'PKZ772': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pafc.cwf.alu.txt',
  'PKZ771': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pafc.cwf.alu.txt',
  'PKZ773': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pafc.cwf.alu.txt',
  'PKZ774': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pafc.cwf.alu.txt',
  'PKZ775': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pafc.cwf.alu.txt',
  'PKZ776': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pafc.cwf.alu.txt',
  'PKZ777': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pafc.cwf.alu.txt',
  'PKZ778': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pafc.cwf.alu.txt',
  'PKZ780': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pafc.cwf.alu.txt',
  'PKZ781': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pafc.cwf.alu.txt',
  'PKZ782': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pafc.cwf.alu.txt'
};

async function fetchNOAAData(zoneId) {
  // Get the forecast URL for this zone
  const url = ZONE_TO_FORECAST_URL[zoneId.toUpperCase()];
  
  if (!url) {
    throw new Error(`No forecast URL found for zone ${zoneId}`);
  }
  
  try {
    console.log(`Fetching forecast from: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BoatSafe/1.0 (https://boatsafe.oceanbight.com contact@oceanbight.com)'
      }
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (response.ok) {
      const text = await response.text();
      console.log(`Got forecast text (${text.length} chars)`);
      
      // Convert to JSON format
      return {
        properties: {
          updated: new Date().toISOString(),
          periods: [{
            name: 'Marine Forecast',
            detailedForecast: text,
            shortForecast: 'Marine conditions for zone ' + zoneId.toUpperCase()
          }]
        }
      };
    } else {
      console.log(`Failed ${response.status}: ${response.statusText}`);
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(`Failed to fetch from ${url}:`, error.message);
    throw new Error('Unable to fetch forecast data from NOAA');
  }
}

exports.handler = async (event, context) => {
  console.log('Function called with:', {
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
    const pathMatch = event.path.match(/\/marine-forecast\/([^\/]+)/);
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
          message: 'Zone ID is required in path: /marine-forecast/{zoneId}',
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
          message: 'Zone ID must be a valid Alaska marine zone (PKZ###)'
        })
      };
    }
    
    // Fetch data from NOAA
    const data = await fetchNOAAData(zoneId);
    
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
    console.error('Proxy error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: 'Unable to fetch marine forecast data'
      })
    };
  }
};