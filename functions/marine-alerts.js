/**
 * Netlify Function: Marine Alerts Proxy
 * Security-first proxy for NOAA Marine Alerts
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

async function fetchMarineAlerts() {
  // NOAA marine alert sources
  const sources = [
    {
      name: 'Alaska Marine Alerts (CFW)',
      url: 'https://tgftp.nws.noaa.gov/data/raw/wh/whak47.pajk.cfw.ajk.txt'
    },
    {
      name: 'Special Marine Warning (SMW)',
      url: 'https://forecast.weather.gov/product.php?site=NWS&issuedby=AJK&product=SMW&format=txt&version=1&glossary=0'
    }
  ];
  
  const alerts = [];
  const fetchPromises = sources.map(async (source) => {
    try {
      console.log(`Fetching marine alerts from: ${source.url}`);
      const response = await fetch(source.url, {
        headers: {
          'User-Agent': 'BoatSafe/1.0 (https://boatsafe.oceanbight.com contact@oceanbight.com)'
        }
      });
      
      if (response.ok) {
        const text = await response.text();
        console.log(`Got ${source.name} data (${text.length} chars)`);
        
        // Parse alerts from text
        const parsedAlerts = parseAlertsFromText(text, source.name);
        alerts.push(...parsedAlerts);
        
        return {
          source: source.name,
          status: 'success',
          alertCount: parsedAlerts.length,
          text: text
        };
      } else {
        console.log(`Failed to fetch ${source.name}: ${response.status}`);
        return {
          source: source.name,
          status: 'error',
          error: `HTTP ${response.status}`
        };
      }
    } catch (error) {
      console.error(`Error fetching ${source.name}:`, error.message);
      return {
        source: source.name,
        status: 'error',
        error: error.message
      };
    }
  });
  
  const results = await Promise.allSettled(fetchPromises);
  const sources_status = results.map(result => 
    result.status === 'fulfilled' ? result.value : { status: 'error', error: 'Request failed' }
  );
  
  return {
    alerts: alerts,
    sources: sources_status,
    timestamp: new Date().toISOString(),
    totalAlerts: alerts.length
  };
}

function parseAlertsFromText(text, sourceName) {
  if (!text || text.trim().length === 0) {
    return [];
  }
  
  const alerts = [];
  
  // Check if this looks like an active alert
  const hasAlert = text.toLowerCase().includes('warning') || 
                   text.toLowerCase().includes('advisory') || 
                   text.toLowerCase().includes('watch') ||
                   text.toLowerCase().includes('alert');
  
  if (hasAlert) {
    // Extract key information
    const lines = text.split('\n').filter(line => line.trim());
    
    // Look for alert headers and content
    let alertType = 'Marine Alert';
    let alertText = text;
    let effectiveTime = null;
    let expirationTime = null;
    
    // Try to identify alert type from content
    if (text.toLowerCase().includes('special marine warning')) {
      alertType = 'Special Marine Warning';
    } else if (text.toLowerCase().includes('marine weather statement')) {
      alertType = 'Marine Weather Statement';
    } else if (text.toLowerCase().includes('coastal flood')) {
      alertType = 'Coastal Flood Alert';
    }
    
    // Look for time information
    const timePatterns = [
      /(\d{1,2}:\d{2}\s*(AM|PM)\s*(AKDT|AKST))/gi,
      /until\s+(\d{1,2}:\d{2}\s*(AM|PM))/gi,
      /effective\s+(\d{1,2}:\d{2}\s*(AM|PM))/gi
    ];
    
    for (const pattern of timePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        if (!effectiveTime) effectiveTime = matches[0];
        else if (!expirationTime) expirationTime = matches[0];
      }
    }
    
    // Clean up alert text for display
    alertText = text
      .replace(/\$\$/g, '')  // Remove $$ markers
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .trim();
    
    alerts.push({
      type: alertType,
      source: sourceName,
      text: alertText,
      effectiveTime: effectiveTime,
      expirationTime: expirationTime,
      severity: determineAlertSeverity(alertType, text),
      id: generateAlertId(alertType, sourceName)
    });
  }
  
  return alerts;
}

function determineAlertSeverity(alertType, text) {
  const content = text.toLowerCase();
  
  if (content.includes('warning') || content.includes('emergency')) {
    return 'high';
  } else if (content.includes('watch') || content.includes('advisory')) {
    return 'medium';
  } else {
    return 'low';
  }
}

function generateAlertId(alertType, sourceName) {
  const timestamp = Date.now();
  const hash = alertType.replace(/\s+/g, '').toLowerCase() + '_' + sourceName.replace(/\s+/g, '').toLowerCase();
  return `${hash}_${timestamp}`;
}

exports.handler = async (event, context) => {
  console.log('Marine alerts function called with:', {
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
    
    // Fetch marine alerts data
    const data = await fetchMarineAlerts();
    
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300' // 5 minutes
      },
      body: JSON.stringify(data)
    };
    
  } catch (error) {
    console.error('Marine alerts proxy error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: 'Unable to fetch marine alerts data'
      })
    };
  }
};