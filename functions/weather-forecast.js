/**
 * Netlify Function: Weather Forecast Proxy
 * Security-first proxy for NOAA Weather Forecast API
 */

// Valid Alaska weather zones - security whitelist
const VALID_ZONES = new Set([
  'AKZ317', 'AKZ318', 'AKZ319', 'AKZ320', 'AKZ321', 'AKZ322', 'AKZ323', 'AKZ324',
  'AKZ325', 'AKZ326', 'AKZ327', 'AKZ328', 'AKZ329', 'AKZ330', 'AKZ331', 'AKZ332'
]);

// Zone name mapping
const ZONE_NAMES = {
  'AKZ317': 'Chugach Mountains',
  'AKZ318': 'Copper River Basin',
  'AKZ319': 'Prince William Sound',
  'AKZ320': 'Kenai Peninsula',
  'AKZ321': 'Anchorage',
  'AKZ322': 'Matanuska Valley',
  'AKZ323': 'Susitna Valley',
  'AKZ324': 'Western Prince William Sound',
  'AKZ325': 'Kodiak Island',
  'AKZ326': 'Bristol Bay',
  'AKZ327': 'Aleutian Islands',
  'AKZ328': 'Pribilof Islands',
  'AKZ329': 'St. Lawrence Island',
  'AKZ330': 'Northwest Arctic',
  'AKZ331': 'North Slope',
  'AKZ332': 'Arctic Ocean'
};

// Rate limiting store (in-memory)
const rateLimitStore = new Map();

function validateZoneId(zoneId) {
  if (!zoneId || typeof zoneId !== 'string') {
    return false;
  }
  
  return VALID_ZONES.has(zoneId.toUpperCase());
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

async function fetchWeatherData(zoneId) {
  // Use the multi-zone URL for weather.gov
  const url = `https://www.weather.gov/arh/lfpfcst.html?AJK=${zoneId}`;
  
  try {
    console.log(`Fetching weather forecast from: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BoatSafe/1.0 (https://boatsafe.oceanbight.com contact@oceanbight.com)'
      }
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (response.ok) {
      const html = await response.text();
      console.log(`Got weather HTML (${html.length} chars)`);
      
      // Extract forecast text from HTML
      const forecastText = extractForecastFromHTML(html, zoneId);
      
      // Return in consistent format
      return {
        properties: {
          updated: new Date().toISOString(),
          zone: zoneId,
          zoneName: ZONE_NAMES[zoneId] || zoneId,
          periods: [{
            name: 'Current Weather Forecast',
            detailedForecast: forecastText,
            shortForecast: `Weather conditions for ${ZONE_NAMES[zoneId] || zoneId}`
          }]
        }
      };
    } else {
      console.log(`Failed ${response.status}: ${response.statusText}`);
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(`Failed to fetch from ${url}:`, error.message);
    throw new Error('Unable to fetch weather forecast data from NWS');
  }
}

function extractForecastFromHTML(html, zoneId) {
  // Basic HTML parsing to extract forecast text
  // Look for zone-specific content
  try {
    // Remove HTML tags and extract text content
    let text = html.replace(/<[^>]*>/g, ' ');
    
    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    // Look for forecast patterns
    const forecastPatterns = [
      new RegExp(`${zoneId}[^.]*\\.`, 'gi'),
      /TODAY[^.]*\./gi,
      /TONIGHT[^.]*\./gi,
      /TEMPERATURE[^.]*\./gi,
      /WIND[^.]*\./gi,
      /SKY[^.]*\./gi
    ];
    
    let extractedText = '';
    
    for (const pattern of forecastPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        extractedText += matches.join(' ') + ' ';
      }
    }
    
    if (extractedText.trim()) {
      return extractedText.trim();
    }
    
    // Fallback: return first 500 characters of cleaned text
    return text.substring(0, 500) + (text.length > 500 ? '...' : '');
    
  } catch (error) {
    console.error('Error extracting forecast text:', error);
    return `Weather forecast for ${ZONE_NAMES[zoneId] || zoneId} - please visit weather.gov for full details.`;
  }
}

exports.handler = async (event, context) => {
  console.log('Weather forecast function called with:', {
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
    const pathMatch = event.path.match(/\/weather-forecast\/([^\/]+)/);
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
          message: 'Zone ID is required in path: /weather-forecast/{zoneId}',
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
          message: 'Zone ID must be a valid Alaska weather zone (AKZ317-AKZ332)'
        })
      };
    }
    
    // Fetch data from NOAA
    const data = await fetchWeatherData(zoneId);
    
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
    console.error('Weather forecast proxy error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: 'Unable to fetch weather forecast data'
      })
    };
  }
};