/**
 * Netlify Function: Marine Alerts Proxy
 * Fetches marine alerts and warnings from NOAA text sources
 */

// Rate limiting store (in-memory)
const rateLimitStore = new Map();

// Alert source configurations
const ALERT_SOURCES = {
  juneau_cfw: {
    url: 'https://tgftp.nws.noaa.gov/data/raw/wh/whak47.pajk.cfw.ajk.txt',
    name: 'Coastal Flood Warnings - Juneau',
    type: 'coastal_flood'
  },
  juneau_smw: {
    url: 'https://forecast.weather.gov/product.php?site=NWS&issuedby=AJK&product=SMW&format=txt&version=1&glossary=0',
    name: 'Special Marine Warnings - Juneau',
    type: 'marine_warning'
  }
};

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

async function fetchAlertData(source) {
  try {
    console.log(`Fetching alert data from: ${source.url}`);
    const response = await fetch(source.url, {
      headers: {
        'User-Agent': 'BoatSafe/1.0 (https://boatsafe.oceanbight.com contact@oceanbight.com)'
      }
    });
    
    console.log(`Response status: ${response.status} for ${source.name}`);
    
    if (response.ok) {
      const text = await response.text();
      console.log(`Got alert data (${text.length} chars) from ${source.name}`);
      
      return {
        source: source.name,
        type: source.type,
        rawText: text,
        timestamp: new Date().toISOString(),
        status: 'success'
      };
    } else {
      console.log(`Failed ${response.status}: ${response.statusText} for ${source.name}`);
      return {
        source: source.name,
        type: source.type,
        error: `HTTP ${response.status}`,
        timestamp: new Date().toISOString(),
        status: 'error'
      };
    }
  } catch (error) {
    console.error(`Failed to fetch from ${source.url}:`, error.message);
    return {
      source: source.name,
      type: source.type,
      error: 'Network error',
      timestamp: new Date().toISOString(),
      status: 'error'
    };
  }
}

function parseCoastalFloodWarning(text) {
  const lines = text.split('\n');
  const alerts = [];
  
  let currentAlert = null;
  let isAlertActive = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines
    if (!trimmed) continue;
    
    // Look for alert type headers
    if (trimmed.includes('Coastal Flood Advisory') || 
        trimmed.includes('Coastal Flood Warning') || 
        trimmed.includes('Coastal Flood Watch')) {
      
      // Extract alert type
      const alertType = trimmed.match(/(Coastal Flood (?:Advisory|Warning|Watch))/)?.[1];
      if (alertType) {
        currentAlert = {
          type: alertType,
          headline: alertType,
          areas: [],
          description: '',
          issued: '',
          expires: '',
          severity: getSeverityFromType(alertType)
        };
        isAlertActive = true;
      }
    }
    
    // Look for geographic areas (usually follow a pattern)
    if (isAlertActive && (trimmed.includes('City and Borough') || 
                         trimmed.includes('Island') || 
                         trimmed.includes('Strait'))) {
      if (currentAlert) {
        currentAlert.areas.push(trimmed);
      }
    }
    
    // Look for time information
    if (isAlertActive && (trimmed.includes('PM AKST') || 
                         trimmed.includes('AM AKST') || 
                         trimmed.includes('PM AKDT') || 
                         trimmed.includes('AM AKDT'))) {
      if (currentAlert) {
        if (trimmed.includes('will expire')) {
          currentAlert.expires = trimmed;
        } else {
          currentAlert.issued = trimmed;
        }
      }
    }
    
    // Add content to description
    if (isAlertActive && currentAlert && 
        !trimmed.includes('WHAK47') && 
        !trimmed.includes('CFWAJK') && 
        !trimmed.includes('National Weather Service') &&
        !trimmed.includes('$$')) {
      currentAlert.description += (currentAlert.description ? '\n' : '') + trimmed;
    }
    
    // End of alert section
    if (trimmed.includes('$$')) {
      if (currentAlert) {
        alerts.push(currentAlert);
        currentAlert = null;
      }
      isAlertActive = false;
    }
  }
  
  // Add any remaining alert
  if (currentAlert) {
    alerts.push(currentAlert);
  }
  
  return alerts;
}

function parseSpecialMarineWarning(text) {
  const alerts = [];
  
  // Check if there are no alerts
  if (text.includes('None issued by this office recently')) {
    return alerts;
  }
  
  // Parse any active warnings from the text
  const lines = text.split('\n');
  let currentAlert = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.includes('Special Marine Warning')) {
      currentAlert = {
        type: 'Special Marine Warning',
        headline: 'Special Marine Warning',
        areas: [],
        description: '',
        issued: '',
        expires: '',
        severity: 'moderate'
      };
    }
    
    if (currentAlert && trimmed && !trimmed.includes('None issued')) {
      currentAlert.description += (currentAlert.description ? '\n' : '') + trimmed;
    }
  }
  
  if (currentAlert && currentAlert.description) {
    alerts.push(currentAlert);
  }
  
  return alerts;
}

function getSeverityFromType(alertType) {
  if (alertType.includes('Warning')) return 'severe';
  if (alertType.includes('Watch')) return 'moderate';
  if (alertType.includes('Advisory')) return 'minor';
  return 'minor';
}

function formatAlertsResponse(alertResults) {
  const allAlerts = [];
  const sources = [];
  
  for (const result of alertResults) {
    sources.push({
      name: result.source,
      type: result.type,
      status: result.status,
      timestamp: result.timestamp,
      error: result.error || null
    });
    
    if (result.status === 'success' && result.rawText) {
      let parsedAlerts = [];
      
      if (result.type === 'coastal_flood') {
        parsedAlerts = parseCoastalFloodWarning(result.rawText);
      } else if (result.type === 'marine_warning') {
        parsedAlerts = parseSpecialMarineWarning(result.rawText);
      }
      
      // Add source information to each alert
      parsedAlerts.forEach(alert => {
        alert.source = result.source;
        alert.sourceType = result.type;
        allAlerts.push(alert);
      });
    }
  }
  
  return {
    alerts: allAlerts,
    sources: sources,
    totalAlerts: allAlerts.length,
    timestamp: new Date().toISOString(),
    status: 'success'
  };
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
    
    // Fetch data from all alert sources
    const alertPromises = Object.values(ALERT_SOURCES).map(source => 
      fetchAlertData(source)
    );
    
    const alertResults = await Promise.all(alertPromises);
    const response = formatAlertsResponse(alertResults);
    
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300' // 5 minutes
      },
      body: JSON.stringify(response)
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