/**
 * Netlify Function: Forecast Discussion Proxy
 * Security-first proxy for NOAA Area Forecast Discussion (AFD)
 */

// Rate limiting store (in-memory)
const rateLimitStore = new Map();

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

async function fetchForecastDiscussion() {
  // NOAA Area Forecast Discussion for Juneau (AJK)
  const url = 'https://forecast.weather.gov/product.php?site=NWS&issuedby=AJK&product=AFD&format=txt&version=1&glossary=0';
  
  try {
    console.log(`Fetching forecast discussion from: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BoatSafe/1.0 (https://boatsafe.oceanbight.com contact@oceanbight.com)'
      }
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (response.ok) {
      const text = await response.text();
      console.log(`Got forecast discussion (${text.length} chars)`);
      
      // Parse and format the discussion
      const parsedDiscussion = parseForecastDiscussion(text);
      
      return {
        properties: {
          updated: new Date().toISOString(),
          office: 'AJK',
          officeName: 'Juneau, AK',
          product: 'AFD',
          productName: 'Area Forecast Discussion',
          text: parsedDiscussion.text,
          issuedTime: parsedDiscussion.issuedTime,
          author: parsedDiscussion.author,
          sections: parsedDiscussion.sections
        }
      };
    } else {
      console.log(`Failed ${response.status}: ${response.statusText}`);
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(`Failed to fetch from ${url}:`, error.message);
    throw new Error('Unable to fetch forecast discussion from NWS');
  }
}

function parseForecastDiscussion(text) {
  if (!text || text.trim().length === 0) {
    return {
      text: 'No forecast discussion available',
      issuedTime: null,
      author: null,
      sections: []
    };
  }
  
  const lines = text.split('\n');
  let cleanedText = '';
  let issuedTime = null;
  let author = null;
  const sections = [];
  let currentSection = null;
  
  // Parse the discussion content
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines and certain markers
    if (!line || line.includes('$$') || line.includes('===')) {
      continue;
    }
    
    // Look for issued time
    if (line.includes('ISSUED') || (line.includes('AM') || line.includes('PM')) && line.includes('AK')) {
      issuedTime = line;
      continue;
    }
    
    // Look for author/forecaster
    if (line.includes('FORECASTER') || (line.length < 20 && line.match(/^[A-Z]{2,5}$/))) {
      author = line;
      continue;
    }
    
    // Look for section headers (usually start with . and are in caps)
    if (line.startsWith('.') && line.includes('...')) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        title: line.replace(/^\./, '').replace(/\.\.\.$/, '').trim(),
        content: ''
      };
      continue;
    }
    
    // Regular content
    if (line.length > 0) {
      if (currentSection) {
        currentSection.content += (currentSection.content ? ' ' : '') + line;
      } else {
        cleanedText += (cleanedText ? ' ' : '') + line;
      }
    }
  }
  
  // Add final section
  if (currentSection) {
    sections.push(currentSection);
  }
  
  // If no sections found, use the cleaned text
  if (sections.length === 0 && cleanedText) {
    sections.push({
      title: 'Forecast Discussion',
      content: cleanedText
    });
  }
  
  // Format the full text for display
  let formattedText = '';
  if (issuedTime) {
    formattedText += `${issuedTime}\n\n`;
  }
  
  sections.forEach(section => {
    formattedText += `${section.title.toUpperCase()}\n`;
    formattedText += `${section.content}\n\n`;
  });
  
  if (author) {
    formattedText += `Forecaster: ${author}`;
  }
  
  return {
    text: formattedText.trim() || 'No forecast discussion available',
    issuedTime: issuedTime,
    author: author,
    sections: sections
  };
}

exports.handler = async (event, context) => {
  console.log('Forecast discussion function called with:', {
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
    
    // Fetch forecast discussion data
    const data = await fetchForecastDiscussion();
    
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
    console.error('Forecast discussion proxy error:', error);
    
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