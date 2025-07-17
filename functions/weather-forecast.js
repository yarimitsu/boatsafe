/**
 * Netlify Function: Weather Forecast Proxy
 * Security-first proxy for NOAA Weather Forecast API
 */

// Valid Alaska weather zones - security whitelist
const VALID_ZONES = new Set([
  'AKZ317', 'AKZ318', 'AKZ319', 'AKZ320', 'AKZ321', 'AKZ322', 'AKZ323', 'AKZ324', 
  'AKZ325', 'AKZ326', 'AKZ327', 'AKZ328', 'AKZ329', 'AKZ330', 'AKZ331', 'AKZ332'
]);

// Zone name mappings for AKZ zones
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

async function fetchWeatherData(zoneId) {
  // Construct the URL with the requested zone
  const baseUrl = 'https://www.weather.gov/arh/lfpfcst.html';
  const url = `${baseUrl}?AJK=${zoneId}`;
  
  try {
    console.log(`Fetching weather forecast from: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BoatSafe/1.0 (https://boatsafe.oceanbight.com contact@oceanbight.com)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (response.ok) {
      const html = await response.text();
      console.log(`Got weather HTML (${html.length} chars)`);
      
      // Parse the HTML to extract weather forecast data
      const weatherData = parseWeatherHtml(html, zoneId);
      
      return {
        properties: {
          updated: new Date().toISOString(),
          zone: zoneId,
          zoneName: ZONE_NAMES[zoneId] || zoneId,
          periods: weatherData.periods || [{
            name: 'Current Weather',
            detailedForecast: weatherData.forecast || 'Weather forecast not available',
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
    throw new Error('Unable to fetch weather data from NOAA');
  }
}

function parseWeatherHtml(html, zoneId) {
  // Simple HTML parsing to extract weather forecast
  // This is a basic implementation - could be enhanced with more sophisticated parsing
  
  try {
    // Look for forecast content in the HTML
    const forecastMatch = html.match(/<div[^>]*class="[^"]*forecast[^"]*"[^>]*>(.*?)<\/div>/is);
    const contentMatch = html.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>(.*?)<\/div>/is);
    const weatherMatch = html.match(/<pre[^>]*>(.*?)<\/pre>/is);
    
    let forecastText = '';
    
    if (weatherMatch) {
      forecastText = weatherMatch[1].trim();
    } else if (forecastMatch) {
      forecastText = forecastMatch[1].replace(/<[^>]*>/g, '').trim();
    } else if (contentMatch) {
      forecastText = contentMatch[1].replace(/<[^>]*>/g, '').trim();
    }
    
    // If we couldn't extract specific forecast, try to find any meaningful text
    if (!forecastText) {
      const bodyMatch = html.match(/<body[^>]*>(.*?)<\/body>/is);
      if (bodyMatch) {
        const bodyText = bodyMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        // Look for weather-related keywords
        const weatherKeywords = ['temperature', 'wind', 'weather', 'forecast', 'conditions', 'partly', 'mostly', 'sunny', 'cloudy', 'rain', 'snow'];
        const sentences = bodyText.split(/[.!?]+/);
        const weatherSentences = sentences.filter(s => 
          weatherKeywords.some(keyword => s.toLowerCase().includes(keyword))
        );
        
        if (weatherSentences.length > 0) {
          forecastText = weatherSentences.slice(0, 3).join('. ').trim();
        }
      }
    }
    
    if (!forecastText) {
      forecastText = `Weather forecast for ${ZONE_NAMES[zoneId] || zoneId} - Data temporarily unavailable. Please check weather.gov directly.`;
    }
    
    return {
      forecast: forecastText,
      periods: [{
        name: 'Current Weather',
        detailedForecast: forecastText,
        shortForecast: `Weather conditions for ${ZONE_NAMES[zoneId] || zoneId}`
      }]
    };
    
  } catch (error) {
    console.error('Error parsing weather HTML:', error);
    return {
      forecast: `Weather forecast for ${ZONE_NAMES[zoneId] || zoneId} - Parsing error. Please check weather.gov directly.`,
      periods: [{
        name: 'Current Weather',
        detailedForecast: 'Weather data temporarily unavailable due to parsing error.',
        shortForecast: `Weather conditions for ${ZONE_NAMES[zoneId] || zoneId}`
      }]
    };
  }
}

exports.handler = async (event, context) => {
  console.log('Weather function called with:', {
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
        'Cache-Control': 'public, max-age=3600' // 1 hour
      },
      body: JSON.stringify(data)
    };
    
  } catch (error) {
    console.error('Weather proxy error:', error);
    
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