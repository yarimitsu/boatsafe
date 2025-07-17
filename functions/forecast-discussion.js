/**
 * Netlify Function: Forecast Discussion Proxy
 * Security-first proxy for NWS Area Forecast Discussion (AFD)
 */

// Valid Alaska forecast offices - security whitelist
const VALID_OFFICES = new Set([
  'AJK', // Juneau
  'AFC', // Anchorage
  'AFG', // Fairbanks
  'AER', // Anchorage
  'ALU', // Anchorage Aleutian
  'EGI', // Anchorage Eastside
  'YAK'  // Yakutat
]);

// Rate limiting store (in-memory for simplicity)
const rateLimitStore = new Map();

function validateOffice(office) {
  if (!office || typeof office !== 'string') {
    return false;
  }
  
  const upperOffice = office.toUpperCase();
  return VALID_OFFICES.has(upperOffice);
}

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxRequests = 30; // Conservative for discussion data
  
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

async function fetchNWSDiscussion(office) {
  // Use the specific URL format provided
  const url = `https://forecast.weather.gov/product.php?site=NWS&issuedby=${office.toUpperCase()}&product=AFD&format=txt&version=1&glossary=0`;
  
  try {
    console.log(`Fetching AFD from: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BoatSafe/1.0 (https://boatsafe.oceanbight.com contact@oceanbight.com)'
      }
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (response.ok) {
      const text = await response.text();
      console.log(`Got AFD text (${text.length} chars)`);
      
      // Parse the discussion text
      return parseAFDText(text, office);
    } else {
      console.log(`Failed ${response.status}: ${response.statusText}`);
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(`Failed to fetch from ${url}:`, error.message);
    throw new Error('Unable to fetch forecast discussion from NWS');
  }
}

function parseAFDText(text, office) {
  // Remove HTML tags and scripts
  let cleanText = text
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  
  // Extract the main discussion content
  const lines = cleanText.split('\n');
  let discussionText = '';
  let inDiscussion = false;
  let issueTime = null;
  let foundAFD = false;
  
  // Look for issue time and discussion content
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines and JavaScript/analytics code
    if (!line || line.includes('GoogleAnalyticsObject') || line.includes('gtag') || line.includes('function') || line.includes('window[')) {
      continue;
    }
    
    // Look for AFD header
    if (line.includes('AREA FORECAST DISCUSSION') || line.includes('Forecast Discussion') || line.includes('National Weather Service')) {
      foundAFD = true;
      // Try to extract timestamp from the line or surrounding lines
      const timeMatch = line.match(/(\d{1,2}:\d{2}\s+(?:AM|PM)\s+\w+\s+\w+\s+\d{1,2}\s+\d{4})/i);
      if (timeMatch) {
        issueTime = timeMatch[1];
      }
      // Also check next few lines for timestamp
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const nextLine = lines[j].trim();
        const nextTimeMatch = nextLine.match(/(\d{1,2}:\d{2}\s+(?:AM|PM)\s+\w+\s+\w+\s+\d{1,2}\s+\d{4})/i);
        if (nextTimeMatch) {
          issueTime = nextTimeMatch[1];
          break;
        }
      }
      inDiscussion = true;
      continue;
    }
    
    // Start capturing after we find the header
    if (foundAFD && (line.includes('SYNOPSIS') || line.includes('SHORT TERM') || line.includes('LONG TERM') || line.includes('AVIATION') || line.includes('MARINE'))) {
      inDiscussion = true;
    }
    
    // Stop at footer or end markers
    if (line.includes('$$') || (line.includes('FIRE WEATHER') && !line.includes('SYNOPSIS'))) {
      if (inDiscussion) {
        break;
      }
    }
    
    // Capture discussion content
    if (inDiscussion && foundAFD && line.length > 0) {
      discussionText += line + '\n';
    }
  }
  
  // If no specific discussion section found, try to extract from the whole text
  if (!discussionText.trim() && foundAFD) {
    // Look for content after National Weather Service line
    const nwsIndex = cleanText.indexOf('National Weather Service');
    if (nwsIndex !== -1) {
      const afterNWS = cleanText.substring(nwsIndex);
      const endIndex = afterNWS.indexOf('$$');
      discussionText = endIndex !== -1 ? afterNWS.substring(0, endIndex) : afterNWS;
    }
  }
  
  // Clean up the text
  discussionText = discussionText
    .replace(/\s+/g, ' ')  // Normalize whitespace
    .replace(/\n\s*\n/g, '\n\n')  // Clean up line breaks
    .trim();
  
  return {
    office: office.toUpperCase(),
    text: discussionText,
    issued: issueTime ? new Date(issueTime) : new Date(),
    rawText: cleanText,
    source: 'NWS Forecast Discussion'
  };
}

exports.handler = async (event, context) => {
  console.log('Forecast Discussion function called with:', {
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
    
    // Extract office from path or query params
    console.log('Extracting office from path:', event.path);
    const pathMatch = event.path.match(/\/forecast-discussion\/([^\/]+)/);
    const office = pathMatch ? pathMatch[1] : event.queryStringParameters?.office;
    
    if (!office) {
      console.log('No office found in path or query params');
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          error: 'Invalid request',
          message: 'Office code is required in path: /forecast-discussion/{office} or as query parameter',
          path: event.path
        })
      };
    }
    
    console.log('Extracted office:', office);
    
    // Validate office
    if (!validateOffice(office)) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          error: 'Invalid office code',
          message: 'Office code must be a valid Alaska forecast office (AJK, AFC, AFG, etc.)'
        })
      };
    }
    
    // Fetch data from NWS
    const data = await fetchNWSDiscussion(office);
    
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
    console.error('Forecast Discussion proxy error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: 'Unable to fetch forecast discussion data'
      })
    };
  }
};