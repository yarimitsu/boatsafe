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
  // Use NWS API for current Alaska marine alerts
  const apiUrl = 'https://api.weather.gov/alerts?area=AK&status=actual&urgency=immediate,expected&severity=minor,moderate,severe,extreme';
  
  const alerts = [];
  let sources_status = [];
  
  try {
    console.log(`Fetching current Alaska alerts from NWS API: ${apiUrl}`);
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'BoatSafe/1.0 (https://boatsafe.oceanbight.com contact@oceanbight.com)',
        'Accept': 'application/geo+json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`Got ${data.features?.length || 0} alerts from NWS API`);
      
      // Filter for marine-related alerts
      const marineAlerts = data.features?.filter(feature => {
        const props = feature.properties;
        const event = props.event?.toLowerCase() || '';
        const headline = props.headline?.toLowerCase() || '';
        const description = props.description?.toLowerCase() || '';
        
        // Check if alert is marine-related
        return event.includes('marine') || 
               event.includes('small craft') || 
               event.includes('gale') || 
               event.includes('storm warning') || 
               headline.includes('marine') || 
               headline.includes('small craft') || 
               headline.includes('coastal') ||
               description.includes('marine') ||
               description.includes('waters') ||
               description.includes('boaters');
      }) || [];
      
      console.log(`Found ${marineAlerts.length} marine-related alerts`);
      
      // Convert to our alert format
      marineAlerts.forEach(feature => {
        const props = feature.properties;
        alerts.push({
          type: props.event || 'Marine Alert',
          source: 'NWS Alaska Region',
          text: props.description || props.headline || 'No description available',
          headline: props.headline,
          effectiveTime: props.effective,
          expirationTime: props.expires,
          severity: props.severity?.toLowerCase() || 'moderate',
          urgency: props.urgency?.toLowerCase() || 'expected',
          areas: props.areaDesc,
          id: props.id || generateAlertId(props.event, 'NWS_API')
        });
      });
      
      sources_status.push({
        source: 'NWS API (Alaska Marine Alerts)',
        status: 'success',
        alertCount: alerts.length,
        totalFeatures: data.features?.length || 0
      });
      
    } else {
      console.log(`Failed to fetch from NWS API: ${response.status}`);
      sources_status.push({
        source: 'NWS API (Alaska Marine Alerts)',
        status: 'error',
        error: `HTTP ${response.status}`
      });
    }
  } catch (error) {
    console.error('Error fetching from NWS API:', error.message);
    sources_status.push({
      source: 'NWS API (Alaska Marine Alerts)',
      status: 'error',
      error: error.message
    });
  }
  
  // Use the most recent alert effective time as the issued time, or current time if no alerts
  let issuedTime = null;
  if (alerts.length > 0) {
    // Find the most recent effective time
    const effectiveTimes = alerts
      .map(alert => alert.effectiveTime)
      .filter(time => time)
      .map(time => new Date(time))
      .sort((a, b) => b.getTime() - a.getTime()); // Sort newest first
    
    if (effectiveTimes.length > 0) {
      issuedTime = effectiveTimes[0].toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  }

  return {
    alerts: alerts,
    sources: sources_status,
    timestamp: new Date().toISOString(),
    issuedTime: issuedTime,
    totalAlerts: alerts.length
  };
}

// Legacy function - no longer needed with NWS API
// Kept for compatibility but not used

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