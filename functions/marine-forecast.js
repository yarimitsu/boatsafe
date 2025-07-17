/**
 * Netlify Function: Marine Forecast Proxy
 * Security-first proxy for NOAA Marine Forecast API
 */

// Valid Alaska marine zones - security whitelist
const VALID_ZONES = new Set([
  'PKZ011', 'PKZ012', 'PKZ013', 'PKZ021', 'PKZ022', 'PKZ031', 'PKZ032', 'PKZ033', 'PKZ034', 'PKZ035',
  'PKZ125', 'PKZ126', 'PKZ127', 'PKZ128', 'PKZ129', 'PKZ130', 'PKZ131',
  'PKZ150', 'PKZ170', 'PKZ171', 'PKZ172', 'PKZ173', 'PKZ174'
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

async function fetchNOAAData(zoneId) {
  // Map zone to forecast file - Southeast zones use PAJK, others use PAFC
  const southeastZones = ['PKZ011', 'PKZ012', 'PKZ013', 'PKZ126', 'PKZ127', 'PKZ128', 'PKZ129', 'PKZ130', 'PKZ131'];
  const forecastFile = southeastZones.includes(zoneId.toUpperCase()) ? 'FZAK51.PAJK' : 'FZAK51.PAFC';

  // Use NOAA grouped forecast file endpoint
  const url = `https://www.ndbc.noaa.gov/data/Forecasts/${forecastFile}.html`;
  
  try {
    console.log(`Fetching grouped forecast from: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BightWatch/1.0 (https://sage-syrniki-159054.netlify.app contact@oceanbight.com)'
      }
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (response.ok) {
      const html = await response.text();
      console.log(`Got forecast HTML (${html.length} chars)`);
      
      // Extract text content from HTML
      const textMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
      const text = textMatch ? textMatch[1].trim() : html;
      
      // Convert to JSON format
      return {
        properties: {
          updated: new Date().toISOString(),
          periods: [{
            name: 'Marine Forecast',
            detailedForecast: text,
            shortForecast: 'Marine conditions for region containing ' + zoneId.toUpperCase()
          }]
        }
      };
    } else {
      console.log(`Failed ${response.status}: ${response.statusText}`);
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(`Failed to fetch from ${url}:`, error.message);
    throw new Error('Unable to fetch forecast data from NOAA grouped forecast');
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