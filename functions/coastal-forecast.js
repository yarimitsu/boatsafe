/**
 * Netlify Function: Coastal Forecast Proxy
 * Security-first proxy for NOAA Coastal Forecast API
 */

// Valid Alaska coastal forecast regions - security whitelist
const VALID_REGIONS = new Set([
  'CWFAJK', // SE Inner Coastal Waters
  'CWFAEG', // SE Outside Coastal Waters
  'CWFYAK', // Yakutat Bay
  'CWFAER', // North Gulf Coast/Kodiak/Cook Inlet
  'CWFALU', // Southwest AK/Aleutians
  'CWFWCZ', // Northwestern AK
  'CWFNSB'  // Arctic
]);

// Rate limiting store (in-memory for simplicity)
const rateLimitStore = new Map();

function validateRegionId(regionId) {
  if (!regionId || typeof regionId !== 'string') {
    return false;
  }
  
  const upperRegionId = regionId.toUpperCase();
  return VALID_REGIONS.has(upperRegionId);
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

// Region to forecast URL mapping
const REGION_TO_FORECAST_URL = {
  'CWFAJK': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pajk.cwf.ajk.txt',
  'CWFAEG': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pajk.cwf.aeg.txt',
  'CWFYAK': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak53.pajk.cwf.yak.txt',
  'CWFAER': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafc.cwf.aer.txt',
  'CWFALU': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pafc.cwf.alu.txt',
  'CWFWCZ': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak52.pafg.cwf.wcz.txt',
  'CWFNSB': 'https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pafg.cwf.nsb.txt'
};

// Region names mapping
const REGION_NAMES = {
  'CWFAJK': 'SE Inner Coastal Waters',
  'CWFAEG': 'SE Outside Coastal Waters',
  'CWFYAK': 'Yakutat Bay',
  'CWFAER': 'North Gulf Coast/Kodiak/Cook Inlet',
  'CWFALU': 'Southwest AK/Aleutians',
  'CWFWCZ': 'Northwestern AK',
  'CWFNSB': 'Arctic'
};

async function fetchNOAACoastalData(regionId) {
  // Get the forecast URL for this region
  const url = REGION_TO_FORECAST_URL[regionId.toUpperCase()];
  
  if (!url) {
    throw new Error(`No forecast URL found for region ${regionId}`);
  }
  
  try {
    console.log(`Fetching coastal forecast from: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BoatSafe/1.0 (https://boatsafe.oceanbight.com contact@oceanbight.com)'
      }
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (response.ok) {
      const text = await response.text();
      console.log(`Got coastal forecast text (${text.length} chars)`);
      
      // Extract issued time from forecast text
      let issuedTime = null;
      const issuedMatch = text.match(/ISSUED.*?(\d{1,2}:\d{2}\s*(AM|PM)\s*(AKDT|AKST).*?)/i) ||
                         text.match(/(\d{1,2}\/\d{1,2}\/\d{4}.*?\d{1,2}:\d{2}\s*(AM|PM))/i);
      if (issuedMatch) {
        issuedTime = issuedMatch[1] || issuedMatch[0];
      }
      
      // Parse locations from the forecast text
      const locations = parseCoastalForecastLocations(text);
      
      // Convert to JSON format
      return {
        regionId: regionId.toUpperCase(),
        regionName: REGION_NAMES[regionId.toUpperCase()],
        properties: {
          updated: new Date().toISOString(),
          issued: issuedTime ? issuedTime : new Date().toISOString(),
          fullText: text,
          locations: locations,
          periods: [{
            name: 'Coastal Forecast',
            detailedForecast: text,
            shortForecast: 'Coastal conditions for ' + REGION_NAMES[regionId.toUpperCase()],
            issueTime: issuedTime
          }]
        }
      };
    } else {
      console.log(`Failed ${response.status}: ${response.statusText}`);
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(`Failed to fetch from ${url}:`, error.message);
    throw new Error('Unable to fetch coastal forecast data from NOAA');
  }
}

function parseCoastalForecastLocations(text) {
  const locations = [];
  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for location headers (usually in format like "LOCATION NAME-" or specific patterns)
    if (line.endsWith('-') && line.length > 3 && !line.includes('$$')) {
      const locationName = line.replace('-', '').trim();
      
      // Look for forecast periods for this location
      const locationForecast = [];
      let j = i + 1;
      
      while (j < lines.length && !lines[j].endsWith('-') && !lines[j].includes('$$')) {
        const forecastLine = lines[j].trim();
        if (forecastLine && forecastLine.startsWith('.')) {
          // This is a forecast period
          const periodName = forecastLine.replace(/^\./, '').replace(/\.\.\.$/, '').trim();
          locationForecast.push({
            name: periodName,
            text: forecastLine
          });
        }
        j++;
      }
      
      if (locationForecast.length > 0) {
        locations.push({
          name: locationName,
          forecast: locationForecast
        });
      }
    }
  }
  
  return locations;
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
    
    // Extract region ID from path
    console.log('Extracting region ID from path:', event.path);
    const pathMatch = event.path.match(/\/coastal-forecast\/([^\/]+)/);
    if (!pathMatch) {
      console.log('No region ID found in path');
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          error: 'Invalid request',
          message: 'Region ID is required in path: /coastal-forecast/{regionId}',
          path: event.path
        })
      };
    }
    
    const regionId = pathMatch[1].toUpperCase();
    console.log('Extracted region ID:', regionId);
    
    // Validate region ID
    if (!validateRegionId(regionId)) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          error: 'Invalid region ID',
          message: 'Region ID must be a valid Alaska coastal forecast region (CWFXXX)'
        })
      };
    }
    
    // Fetch data from NOAA
    const data = await fetchNOAACoastalData(regionId);
    
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