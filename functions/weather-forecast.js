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
  // Use the multi-zone URL with all Alaska zones
  const url = 'https://www.weather.gov/arh/lfpfcst.html?AJK=AKZ317&AJK=AKZ318&AJK=AKZ319&AJK=AKZ320&AJK=AKZ321&AJK=AKZ322&AJK=AKZ323&AJK=AKZ324&AJK=AKZ325&AJK=AKZ326&AJK=AKZ327&AJK=AKZ328&AJK=AKZ329&AJK=AKZ330&AJK=AKZ331&AJK=AKZ332';
  
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
      
      // Extract forecast text for specific zone from HTML
      const forecastText = extractZoneForecastFromHTML(html, zoneId);
      
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

function extractZoneForecastFromHTML(html, zoneId) {
  try {
    // Look for zone-specific forecast in the HTML
    // The page contains forecast data for each zone
    
    // First, try to find zone-specific content by looking for the zone ID
    const zonePattern = new RegExp(`${zoneId}[\\s\\S]*?(?=${Object.keys(ZONE_NAMES).filter(z => z !== zoneId).join('|')}|$)`, 'i');
    const zoneMatch = html.match(zonePattern);
    
    let text = zoneMatch ? zoneMatch[0] : html;
    
    // Remove HTML tags
    text = text.replace(/<[^>]*>/g, ' ');
    
    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    // Look for forecast content patterns specific to zone
    const forecastPatterns = [
      new RegExp(`${zoneId}[^\\n]*`, 'gi'),
      /TODAY[^.]*\./gi,
      /TONIGHT[^.]*\./gi,
      /TEMPERATURE[^.]*\./gi,
      /WIND[^.]*\./gi,
      /SKY[^.]*\./gi,
      /WEATHER[^.]*\./gi
    ];
    
    let extractedText = '';
    
    for (const pattern of forecastPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        extractedText += matches.join(' ') + ' ';
      }
    }
    
    // If we found zone-specific content, return it
    if (extractedText.trim() && extractedText.length > 50) {
      return extractedText.trim();
    }
    
    // Fallback: look for general forecast content
    const lines = text.split(/\n|\r\n/).filter(line => line.trim().length > 10);
    const forecastLines = lines.filter(line => 
      line.toLowerCase().includes('forecast') ||
      line.toLowerCase().includes('weather') ||
      line.toLowerCase().includes('temperature') ||
      line.toLowerCase().includes('wind') ||
      line.toLowerCase().includes('sky')
    );
    
    if (forecastLines.length > 0) {
      return forecastLines.slice(0, 3).join(' ').substring(0, 500);
    }
    
    // Final fallback
    return `Weather forecast for ${ZONE_NAMES[zoneId] || zoneId}. Visit weather.gov for detailed conditions.`;
    
  } catch (error) {
    console.error('Error extracting zone forecast:', error);
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