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
      const url = `https://forecast.weather.gov/product.php?site=NWS&issuedby=AJK&product=${code}&format=TXT&version=1&glossary=0`;
      console.log(`Fetching ${name} from: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'BoatSafe/1.0 (https://boatsafe.oceanbight.com contact@oceanbight.com)',
          'Accept': 'text/plain, text/html'
        }
      });
      
      if (response.ok) {
        const text = await response.text();
        console.log(`Got ${name}, length: ${text.length}`);
        
        let actualWarningText = '';
        let isHtml = false;
        
        // Check if we got HTML instead of text
        if (text.includes('<!DOCTYPE html') || text.includes('<html>')) {
          isHtml = true;
          console.log(`Processing HTML response for ${name}`);
          
          // First check for "None issued by this office recently" or similar messages
          if (text.includes('None issued by this office recently') ||
              text.includes('No current products') || 
              text.includes('No products are current') ||
              text.includes('No current watches') ||
              text.includes('No current warnings')) {
            actualWarningText = `No current ${name.toLowerCase()}.`;
            console.log(`Found 'none issued' message for ${name}`);
          } else {
            // Try to extract warning text from HTML - look for <pre> tags with specific classes
            let preMatch = text.match(/<pre[^>]*class[^>]*glossaryProduct[^>]*>(.*?)<\/pre>/s);
            if (!preMatch) {
              // Fallback to any <pre> tag
              preMatch = text.match(/<pre[^>]*>(.*?)<\/pre>/s);
            }
            
            if (preMatch && preMatch[1]) {
              const extractedText = preMatch[1].trim();
              console.log(`Extracted from <pre> tag, length: ${extractedText.length}`);
              
              // Check if the extracted text contains actual warning content
              if (extractedText.length > 50 && 
                  (extractedText.includes('URGENT') || 
                   extractedText.includes('ADVISORY') || 
                   extractedText.includes('WARNING') ||
                   extractedText.includes('WATCH') ||
                   extractedText.includes('National Weather Service') ||
                   extractedText.includes('DISCUSSION') ||
                   extractedText.includes('FORECAST') ||
                   extractedText.includes('WWAK') ||
                   extractedText.includes('PAJK'))) {
                actualWarningText = extractedText;
              } else {
                // Check if it's just stating no products are current
                actualWarningText = `No current ${name.toLowerCase()}.`;
              }
            } else {
              // If we can't extract properly, indicate no content but log the issue
              console.log(`Failed to extract content from HTML for ${name}, text length: ${text.length}`);
              actualWarningText = `No current ${name.toLowerCase()}.`;
            }
          }
        } else {
          actualWarningText = text.trim();
        }
        
        // Extract timestamp from the warning text
        const timestamp = extractTimestamp(actualWarningText);
        
        // Determine if this has meaningful content
        const hasActiveWarning = actualWarningText.length > 100 && 
                                !actualWarningText.includes('No products are current') &&
                                !actualWarningText.includes('No current watches') &&
                                !actualWarningText.includes('No current warnings') &&
                                !actualWarningText.startsWith('No current') &&
                                (actualWarningText.includes('URGENT') || 
                                 actualWarningText.includes('ADVISORY') || 
                                 actualWarningText.includes('WARNING') ||
                                 actualWarningText.includes('WATCH') ||
                                 actualWarningText.includes('DISCUSSION') ||
                                 actualWarningText.includes('FORECAST') ||
                                 actualWarningText.includes('National Weather Service') ||
                                 actualWarningText.includes('WWAK') ||
                                 actualWarningText.includes('PAJK'));
        
        warnings[code] = {
          name: name,
          content: actualWarningText || `No ${name.toLowerCase()} currently active.`,
          timestamp: timestamp,
          updated: new Date().toISOString(),
          hasContent: hasActiveWarning,
          sourceType: isHtml ? 'html' : 'text'
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
    // Pattern like "319 AM AKDT Mon Jul 21 2025"
    /(\d{3,4}\s*(AM|PM)\s*(AKDT|AKST)\s*\w+\s*\w+\s*\d{1,2}\s*\d{4})/i,
    // Pattern like "3:19 AM AKDT Mon Jul 21 2025"
    /(\d{1,2}:\d{2}\s*(AM|PM)\s*(AKDT|AKST)\s*\w+\s*\w+\s*\d{1,2}\s*\d{4})/i,
    // Pattern after "National Weather Service"
    /National Weather Service.*?(\d{3,4}\s*(AM|PM)\s*(AKDT|AKST).*?\d{4})/i,
    /National Weather Service.*?(\d{1,2}:\d{2}\s*(AM|PM)\s*(AKDT|AKST).*?\d{4})/i,
    // Pattern like "Mon Jul 21 2025 3:19 AM"
    /(\w+\s*\w+\s*\d{1,2}\s*\d{4}.*?\d{1,2}:\d{2}\s*(AM|PM))/i,
    // Simple time pattern
    /(\d{1,2}:\d{2}\s*(AM|PM)\s*(AKDT|AKST))/i,
    /(\d{3,4}\s*(AM|PM)\s*(AKDT|AKST))/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let timestamp = match[1] || match[0];
      // Clean up timestamp formatting
      timestamp = timestamp.replace(/\s+/g, ' ').trim();
      return timestamp;
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
