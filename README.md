# <img src="oceanbightlogo.png" alt="Ocean Bight" width="32" height="32"> Boat Safe
**Marine forecasts for Alaska waters**

A comprehensive marine safety application providing real-time weather data, forecasts, and observations for Alaska coastal waters. Built with modern web technologies and optimized for both desktop and mobile use.

## Features

### Current Widgets (All Functional)
- **Marine Forecast Widget** - NOAA marine forecasts for Alaska zones with region/zone selection
- **Weather Forecast Widget** - Weather forecasts for Southeast Alaska zones (AKZ317-AKZ332) 
- **Buoy Observations Widget** - Real-time buoy data from NDBC stations with formatted field display
- **Marine Alerts Widget** - Current marine alerts, warnings, and advisories with severity indicators
- **Forecast Discussion Widget** - Detailed meteorologist discussions with enhanced readability
- **Tide Information Widget** - Tide predictions with date navigation and high/low tide indicators

### Key Capabilities
- **Responsive Design** - Optimized for mobile and desktop viewing
- **Real-time Data** - Live feeds from NOAA, NDBC, and NWS sources
- **Client-side Caching** - Efficient data management with configurable TTL
- **No Tracking** - Privacy-focused with no user data collection
- **Progressive Web App** - Installable with offline capabilities

## Coverage Areas

### Marine Forecast Zones
- Alaska coastal and offshore marine zones
- Region-based zone selection interface

### Weather Forecast Zones  
- Southeast Alaska zones (AKZ317-AKZ332):
  - City and Borough of Yakutat
  - Municipality of Skagway  
  - Haines Borough and Klukwan
  - Glacier Bay
  - Eastern Chichagof Island
  - Cape Fairweather to Lisianski Strait
  - City and Borough of Sitka
  - Admiralty Island
  - City and Borough of Juneau
  - Petersburg Borough
  - Western Kupreanof and Kuiu Island
  - Prince of Wales Island
  - City and Borough of Wrangell
  - Ketchikan Gateway Borough
  - City of Hyder
  - Annette Island

### Buoy Stations
- 50+ NDBC buoy and coastal observation stations
- Real-time measurements: wind, waves, water temperature, pressure

## Technical Architecture

### Frontend
- **Vanilla JavaScript ES6+** - No framework dependencies
- **CSS Grid/Flexbox** - Modern responsive layouts
- **Web APIs** - Service Workers, Local Storage, Fetch API
- **Widget-based Architecture** - Modular, maintainable components

### Backend (Netlify Functions)
- **CORS Proxy Functions** - Secure data fetching from NOAA/NDBC
- **Rate Limiting** - Built-in protection against abuse
- **Error Handling** - Robust fallback mechanisms
- **Caching Headers** - Optimized performance

### Data Sources
- **NOAA National Weather Service** - Marine forecasts, weather data, alerts
- **National Data Buoy Center (NDBC)** - Real-time buoy observations  
- **NOAA Tides & Currents** - Tide predictions and water levels
- **NWS Forecast Discussions** - Meteorologist analysis and discussions

## Quick Start

### Prerequisites
- Node.js 18+ 
- Git

### Local Development
```bash
# Clone the repository
git clone https://github.com/yarimitsu/boatsafe.git
cd boatsafe

# Install dependencies
npm install

# Start development server
npm start

# Build for production
npm run build
```

### Deployment
- **Automatic Deployment** - Pushes to `main` branch deploy automatically to Netlify
- **Environment** - Production: `https://boatsafe.oceanbight.com`
- **Functions** - Netlify Functions handle all external API calls

## Project Structure

```
bightwatch/
├── src/                    # Frontend source code
│   ├── js/
│   │   ├── widgets/       # Individual widget components
│   │   │   ├── alerts.js           # Marine alerts widget
│   │   │   ├── discussion.js       # Forecast discussion widget
│   │   │   ├── forecast-summary.js # Marine forecast widget
│   │   │   ├── observations.js     # Buoy observations widget
│   │   │   ├── tides.js           # Tide information widget
│   │   │   └── weather.js         # Weather forecast widget
│   │   ├── utils/         # Utility functions
│   │   └── app.js         # Main application logic
│   ├── css/               # Styling
│   │   ├── main.css       # Base styles and variables
│   │   └── widgets.css    # Widget-specific styles
│   └── index.html         # Main HTML file
├── functions/             # Netlify Functions (CORS proxies)
│   ├── buoy-data.js       # NDBC buoy data proxy
│   ├── forecast-discussion.js  # NWS forecast discussion proxy
│   ├── marine-alerts.js   # Marine alerts proxy
│   ├── marine-forecast.js # Marine forecast proxy
│   ├── tide-data.js       # Tide data proxy
│   └── weather-forecast.js # Weather forecast proxy
├── netlify.toml           # Netlify configuration
└── package.json           # Dependencies and scripts
```

## Security & Privacy

### CORS Protection
- All external API calls routed through Netlify Functions
- Proper CORS headers configured for cross-origin requests
- Rate limiting implemented on all function endpoints

### Privacy Features
- No user tracking or analytics
- No data collection or storage
- Client-side data caching only
- No third-party dependencies for tracking

### Data Validation
- Input sanitization on all user inputs
- Whitelist-based station/zone validation
- Error handling with graceful degradation

## Browser Support

- **Modern Browsers** - Chrome 70+, Firefox 65+, Safari 12+, Edge 79+
- **Mobile Optimized** - iOS Safari, Chrome Mobile, Samsung Internet
- **Progressive Enhancement** - Graceful degradation for older browsers

## Development Features

### Widget Development
- Modular ES6 class-based widgets
- Consistent error handling patterns
- Responsive design utilities
- Built-in loading and error states

### Performance Optimizations
- Client-side caching with configurable TTL
- Image optimization and lazy loading
- Minified production builds
- Service Worker for offline functionality

### Development Tools
- Hot reload development server
- ESLint configuration
- Build optimization scripts
- Netlify local development support

## Recent Updates

### Widget Improvements
- **Mobile Responsiveness** - Fixed text overflow issues on marine forecast widget
- **Buoy Observations** - Enhanced field display with separate lines for better readability
- **Marine Alerts** - Updated data source and added severity indicators with timestamp
- **Forecast Discussion** - Improved paragraph breaks and removed extraneous content
- **Tide Widget** - Enhanced text visibility and centered date navigation
- **Weather Forecast** - Updated with accurate Southeast Alaska zone names

### Technical Enhancements
- Comprehensive CORS configuration across all Netlify functions
- Improved error handling and fallback mechanisms
- Enhanced mobile layout optimization
- Better text formatting and readability across all widgets

## License

MIT License - see LICENSE file for details

## Contributing

Contributions welcome! Please read the contributing guidelines and submit pull requests for any improvements.

## Disclaimer

This application provides marine weather information for informational purposes only. For emergency situations and critical marine navigation decisions, always consult official NOAA marine forecasts and local maritime authorities.

---

**Data Sources**: NOAA National Weather Service, National Data Buoy Center, NOAA Tides & Currents  
**Deployment**: Netlify  
**Repository**: https://github.com/yarimitsu/boatsafe