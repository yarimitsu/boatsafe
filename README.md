# <img src="src/oceanbightlogo.png" alt="Ocean Bight" width="32" height="32"> Boat Safe
**Marine forecasts for Alaska waters**

A comprehensive marine weather application displaying real-time NOAA data for Alaska coastal waters, featuring 5 specialized widgets for different marine weather needs.

## Features

- **Marine Forecast** - NOAA marine forecasts by region and zone with detailed period-by-period conditions
- **SEAK Observations** - Southeast Alaska marine observations from 92+ weather stations with current conditions
- **Tides & Currents** - Tide predictions with date navigation for 3,372+ Alaska stations, plus current data for 32 monitoring stations
- **Forecast Discussion** - Collapsible meteorologist analysis and technical discussions for 3 Alaska regions
- **Weather Warnings** - Current weather warnings and advisories from NOAA alerts system
- **Coastal Forecasts** - Marine forecasts for all 7 Alaska coastal regions (SE Inner/Outer, Yakutat Bay, North Gulf Coast, Southwest AK, Northwest AK, Arctic)

## Quick Start

```bash
git clone https://github.com/yarimitsu/boatsafe.git
cd boatsafe
npm install
npm start
```

Deploys to Netlify automatically on push to main. Access at: https://boatsafe.oceanbight.com

## How It Works

### Architecture Overview

**Boat Safe** uses a **widget-based architecture** where each marine weather feature is a self-contained JavaScript class that manages its own data loading, UI state, and user interactions.

### Data Loading Strategy

The application uses a **two-tier data loading approach** for optimal performance:

1. **Local JSON Files** → Fast dropdown population (station lists, regions, zones)
2. **API Calls** → Real-time data fetching (weather, tides, observations)

This ensures dropdown menus populate instantly while weather data stays current.

### Widget Architecture

Each widget follows a consistent pattern:

```javascript
class WidgetName {
  constructor() {
    // Initialize DOM elements and state
  }
  
  async loadStations() {
    // Load station data from local JSON file
  }
  
  populateDropdown() {
    // Populate dropdown with station options
  }
  
  async selectStation(stationId) {
    // Fetch real-time data via Netlify function
  }
  
  renderData(data) {
    // Display weather data to user
  }
}
```

### Data Flow

1. **Page Load** → All widgets initialize and load station data from local JSON files
2. **User Selection** → Widget makes API call through Netlify function for real-time data
3. **Data Display** → Weather information rendered with consistent formatting
4. **Error Handling** → Graceful fallbacks and user-friendly error messages

### Local vs Production Modes

- **Local Development** (`localhost`) → Shows placeholder data for testing
- **Production** (`boatsafe.oceanbight.com`) → Fetches live NOAA data via secure Netlify functions

## Technical Implementation

### Frontend Stack
- **Vanilla JavaScript** - No frameworks, optimized for performance
- **CSS Grid/Flexbox** - Responsive design for mobile and desktop
- **Web APIs** - Fetch API, LocalStorage for preferences

### Backend (Netlify Functions)
- **CORS Proxy** - Secure access to NOAA APIs without exposing keys
- **Data Processing** - Parse and validate NOAA data formats
- **Caching** - Appropriate cache headers for different data types
- **Error Handling** - Robust error handling and logging

### Data Sources & Coverage

| Widget | Data Source | Coverage | Update Frequency |
|--------|-------------|----------|------------------|
| Marine Forecast | NOAA NWS Marine API | Alaska zones & regions | 6 hours |
| SEAK Observations | NOAA Weather Service | 92+ Southeast Alaska stations | 10 minutes |
| Tides | NOAA Tides & Currents | 3,372+ tide stations | Daily predictions |
| Currents | NOAA Tides & Currents | 32 Alaska current stations | Daily predictions |
| Weather Warnings | NOAA NWS Alerts API | Statewide Alaska alerts | Real-time |
| Coastal Forecasts | NOAA Marine Forecasts | 7 Alaska coastal regions | 6 hours |

### Performance Optimizations

- **Local Data Caching** - Station lists cached locally for instant dropdown population
- **Smart API Caching** - Weather data cached 10-60 minutes depending on update frequency  
- **Lazy Loading** - Data only fetched when user selects a station/region
- **Minimal Dependencies** - No external libraries, pure JavaScript for fast loading
- **Progressive Enhancement** - Works without JavaScript (basic HTML fallbacks)

## Project Structure

```
/
├── src/
│   ├── js/
│   │   ├── utils/
│   │   │   ├── cache.js          # Caching utilities
│   │   │   └── http.js           # HTTP request wrapper
│   │   ├── widgets/
│   │   │   ├── forecast-summary.js    # Marine forecasts
│   │   │   ├── seak-observations.js   # SEAK weather observations
│   │   │   ├── tides-currents.js      # Tides with date navigation
│   │   │   ├── currents.js            # Current predictions
│   │   │   ├── discussion.js          # Forecast discussions
│   │   │   ├── coastal-forecast.js    # Coastal marine forecasts
│   │   │   ├── weather.js             # Weather warnings/alerts
│   │   │   └── location-selector.js   # Location selection UI
│   │   ├── forecast-parser.js     # NOAA data parsing utilities
│   │   └── app.js                # Main application controller
│   ├── data/
│   │   ├── zones.json            # Marine forecast zones & regions
│   │   ├── seak-stations.json    # Southeast Alaska observation stations
│   │   ├── tide-stations.json    # 3,372+ tide prediction stations
│   │   ├── current-stations.json # 32 Alaska current monitoring stations
│   │   ├── coastal-stations.json # 7 Alaska coastal forecast regions
│   │   └── endpoints.json        # API endpoint configurations
│   ├── css/
│   │   ├── main.css             # Base styles and layout
│   │   └── widgets.css          # Widget-specific styling
│   └── index.html               # Single-page application
├── functions/                   # Netlify Functions (CORS proxies)
│   ├── marine-forecast.js      # Marine forecast data
│   ├── seak-observations.js    # SEAK observation data
│   ├── tide-data.js           # Tide predictions
│   ├── current-data.js        # Current predictions
│   ├── discussion.js          # Forecast discussions
│   ├── coastal-forecast.js    # Coastal forecasts
│   ├── marine-alerts.js       # Weather warnings
│   ├── location-search.js     # Location search
│   └── endpoints.js           # Endpoint configuration
└── package.json              # Dependencies and scripts
```

## Widget Details

### 🌊 Marine Forecast Widget
- **Purpose**: Detailed marine forecasts by Alaska region and zone
- **Data**: NOAA Marine Weather API
- **Features**: Period-by-period conditions, wind, seas, weather
- **Coverage**: All Alaska marine forecast zones

### 🏔️ SEAK Observations Widget  
- **Purpose**: Real-time weather observations from Southeast Alaska
- **Data**: NOAA Weather Service observation network
- **Features**: Current conditions, wind, temperature, pressure, visibility
- **Coverage**: 92+ Southeast Alaska weather stations

### 🌊 Tides & Currents Widget
- **Purpose**: Tide predictions and current forecasts
- **Data**: NOAA Tides & Currents API
- **Features**: Daily tide tables, date navigation, current predictions
- **Coverage**: 3,372+ tide stations, 32 current monitoring stations

### 💬 Forecast Discussion Widget
- **Purpose**: Technical meteorologist analysis and discussions
- **Data**: NOAA Weather Service discussions
- **Features**: Collapsible sections, technical weather analysis
- **Coverage**: 3 Alaska regions (Anchorage, Fairbanks, Juneau)

### ⚠️ Weather Warnings Widget
- **Purpose**: Current weather warnings and marine advisories
- **Data**: NOAA NWS Alerts API
- **Features**: Real-time alerts, severity indicators
- **Coverage**: Statewide Alaska weather warnings

### 🏖️ Coastal Forecasts Widget
- **Purpose**: Marine forecasts for Alaska coastal waters
- **Data**: NOAA Marine Forecast text products
- **Features**: Low-bandwidth text forecasts, 7 coastal regions
- **Coverage**: SE Inner/Outer Waters, Yakutat Bay, North Gulf Coast, Southwest AK, Northwest AK, Arctic

## Development

### Local Development
```bash
npm start          # Start local development server
npm run build      # Build for production
npm run deploy     # Deploy to Netlify
```

### Environment Modes
- **Local** (`localhost:8080`) → Placeholder data for testing
- **Production** (`boatsafe.oceanbight.com`) → Live NOAA data

### Adding New Widgets
1. Create widget class in `src/js/widgets/`
2. Add station data to `src/data/` if needed
3. Create Netlify function in `functions/` for API access
4. Add HTML structure to `index.html`
5. Initialize widget in `src/js/app.js`

## Data Sources

All data provided by NOAA (National Oceanic and Atmospheric Administration):
- **National Weather Service** - Marine forecasts and warnings
- **National Data Buoy Center** - Observation data
- **Tides & Currents** - Tidal predictions and current data

## License

MIT License - See LICENSE file for details

## Disclaimer

**For emergency situations, always consult official NOAA marine forecasts and local authorities.**

This application is for informational purposes only and should not be the sole source for marine safety decisions. Weather conditions can change rapidly - always check multiple sources and exercise caution on the water.

## Support

- **Issues**: Report bugs at [GitHub Issues](https://github.com/yarimitsu/boatsafe/issues)
- **Documentation**: See [CLAUDE.md](CLAUDE.md) for development guidelines
- **Contact**: Ocean Bight LLC