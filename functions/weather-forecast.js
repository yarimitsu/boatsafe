/**
 * Netlify Function: Weather Warnings and Advisories Proxy
 * Security-first proxy for NOAA Weather Warnings from Juneau office
 */

// Valid warning types from NOAA Juneau office
const VALID_WARNING_TYPES = new Set([
  'NPW', // Non-Precipitation Warnings
  'WSW', // Winter Storm Warnings
  'WCN', // Weather Conditions
  'SPS', // Special Weather Statements
  'HWO', // Hazardous Weather Outlook
  'AFD', // Area Forecast Discussion
  'NOW'  // Short Term Forecast
]);

// Warning type descriptions
const WARNING_TYPES = {
  'NPW': 'Non-Precipitation Warnings',
  'WSW': 'Winter Storm Warnings', 
  'WCN': 'Weather Conditions',
  'SPS': 'Special Weather Statements',
  'HWO': 'Hazardous Weather Outlook',
  'AFD': 'Area Forecast Discussion',
  'NOW': 'Short Term Forecast'
};

// Rate limiting store (in-memory)
const rateLimitStore = new Map();

function validateWarningType(warningType) {
  if (!warningType || typeof warningType !== 'string') {
    return false;
  }
  return VALID_WARNING_TYPES.has(warningType.toUpperCase());
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

async function fetchAllWarnings() {
  const warnings = {};
  
  // Fetch all warning types
  for (const [code, name] of Object.entries(WARNING_TYPES)) {
    try {
      const url = `https://forecast.weather.gov/product.php?site=NWS&issuedby=AJK&product=${code}&format=txt&version=1&glossary=0`;
      console.log(`Fetching ${name} from: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'BoatSafe/1.0 (https://boatsafe.oceanbight.com contact@oceanbight.com)',
          'Accept': 'text/plain'
        }
      });
      
      if (response.ok) {
        const text = await response.text();
        console.log(`Got ${name}, length: ${text.length}`);
        
        // Extract timestamp from the warning text
        const timestamp = extractTimestamp(text);
        
        warnings[code] = {
          name: name,
          content: text.trim(),
          timestamp: timestamp,
          updated: new Date().toISOString(),
          hasContent: text.trim().length > 50 // Show warnings with meaningful content
        };
      } else {
        console.log(`Failed to fetch ${name}: ${response.status}`);
        warnings[code] = {
          name: name,
          content: `No ${name.toLowerCase()} currently active.`,
          timestamp: null,
          updated: new Date().toISOString(),
          hasContent: false
        };
      }
    } catch (error) {
      console.error(`Error fetching ${name}:`, error);
      warnings[code] = {
        name: name,
        content: `Error loading ${name.toLowerCase()}.`,
        timestamp: null,
        updated: new Date().toISOString(),
        hasContent: false
      };
    }
  }
  
  return warnings;
}

function extractTimestamp(text) {
  // Look for various timestamp patterns in NOAA warnings
  const patterns = [
    /(\d{1,2}:\d{2}\s*(AM|PM)\s*(AKDT|AKST)\s*\w+\s*\w+\s*\d{1,2}\s*\d{4})/i,
    /(\d{3,4}\s*(AM|PM)\s*(AKDT|AKST)\s*\w+\s*\w+\s*\d{1,2}\s*\d{4})/i,
    /National Weather Service.*?(\d{1,2}:\d{2}\s*(AM|PM)\s*(AKDT|AKST).*?\d{4})/i,
    /(\w+\s*\w+\s*\d{1,2}\s*\d{4}.*?\d{1,2}:\d{2}\s*(AM|PM))/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1] || match[0];
    }
  }
  
  return null;
}

// Remove this unused function - it's not needed for weather warnings

exports.handler = async (event, context) => {
  console.log('Weather warnings function called with:', {
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

    // Fetch all weather warnings from NOAA Juneau office
    console.log('Fetching all weather warnings from NOAA Juneau office');
    const warnings = await fetchAllWarnings();

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=900' // 15 minutes (warnings change more frequently)
      },
      body: JSON.stringify({
        warnings: warnings,
        updated: new Date().toISOString(),
        office: 'AJK',
        officeName: 'NOAA Weather Service Juneau'
      })
    };

  } catch (error) {
    console.error('Weather warnings proxy error:', error);

    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: 'Unable to fetch weather warnings data'
      })
    };
  }
};
