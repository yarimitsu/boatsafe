/**
 * Netlify Function: Weather Forecast Proxy
 * Security-first proxy for NOAA Weather Forecast API
 */

// Valid Alaska weather zones - security whitelist
const VALID_ZONES = new Set([
  'AKZ317', 'AKZ318', 'AKZ319', 'AKZ320', 'AKZ321', 'AKZ322', 'AKZ323', 'AKZ324',
  'AKZ325', 'AKZ326', 'AKZ327', 'AKZ328', 'AKZ329', 'AKZ330', 'AKZ331', 'AKZ332'
]);

// Zone name mapping (Southeast Alaska)
const ZONE_NAMES = {
  'AKZ317': 'City and Borough of Yakutat',
  'AKZ318': 'Municipality of Skagway',
  'AKZ319': 'Haines Borough and Klukwan',
  'AKZ320': 'Glacier Bay',
  'AKZ321': 'Eastern Chichagof Island',
  'AKZ322': 'Cape Fairweather to Lisianski Strait',
  'AKZ323': 'City and Borough of Sitka',
  'AKZ324': 'Admiralty Island',
  'AKZ325': 'City and Borough of Juneau',
  'AKZ326': 'Petersburg Borough',
  'AKZ327': 'Western Kupreanof and Kuiu Island',
  'AKZ328': 'Prince of Wales Island',
  'AKZ329': 'City and Borough of Wrangell',
  'AKZ330': 'Ketchikan Gateway Borough',
  'AKZ331': 'City of Hyder',
  'AKZ332': 'Annette Island'
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
  // Use the NWS API for zone forecasts
  const url = `https://api.weather.gov/zones/forecast/${zoneId}/forecast`;
  
  try {
    console.log(`Fetching weather forecast from NWS API: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BoatSafe/1.0 (https://boatsafe.oceanbight.com contact@oceanbight.com)',
        'Accept': 'application/json'
      }
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`Got weather data for ${zoneId}:`, data);
      
      // Return the data in the expected format
      return {
        properties: {
          updated: data.properties?.updated || new Date().toISOString(),
          zone: zoneId,
          zoneName: ZONE_NAMES[zoneId] || zoneId,
          periods: data.properties?.periods || [{
            name: 'Current Weather Forecast',
            detailedForecast: `Weather forecast for ${ZONE_NAMES[zoneId] || zoneId}`,
            shortForecast: `Conditions for ${ZONE_NAMES[zoneId] || zoneId}`
          }]
        }
      };
    } else {
      console.log(`Failed ${response.status}: ${response.statusText}`);
      
      // Fallback to a simple forecast message
      return {
        properties: {
          updated: new Date().toISOString(),
          zone: zoneId,
          zoneName: ZONE_NAMES[zoneId] || zoneId,
          periods: [{
            name: 'Weather Forecast',
            detailedForecast: `Weather forecast for ${ZONE_NAMES[zoneId] || zoneId}. Visit weather.gov for current conditions and detailed forecasts.`,
            shortForecast: `${ZONE_NAMES[zoneId] || zoneId} conditions`
          }]
        }
      };
    }
  } catch (error) {
    console.error(`Failed to fetch from ${url}:`, error.message);
    
    // Return fallback data instead of throwing
    return {
      properties: {
        updated: new Date().toISOString(),
        zone: zoneId,
        zoneName: ZONE_NAMES[zoneId] || zoneId,
        periods: [{
          name: 'Weather Forecast',
          detailedForecast: `Weather forecast for ${ZONE_NAMES[zoneId] || zoneId}. Visit weather.gov for current conditions.`,
          shortForecast: `${ZONE_NAMES[zoneId] || zoneId} conditions`
        }]
      }
    };
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