# Boat Safe
**Marine forecasts for Alaska waters**

## Features

- Marine forecasts from NOAA for Alaska zones
- Real-time buoy observations from NDBC stations
- Tide predictions for Alaska coastal stations
- Marine alerts and weather warnings
- Forecast discussions from meteorologists
- Weather forecasts by zone
- No tracking or data collection

## Data Sources

- NOAA marine forecasts and zone data
- NDBC buoy observations
- NOAA tide predictions
- NWS marine alerts and forecast discussions
- Weather forecasts by zone

## Development

Requires Node.js 18+

```bash
git clone https://github.com/yarimitsu/boatsafe.git
cd boatsafe
npm install
npm start
```

Deploys automatically to Netlify on push to main branch.

## Architecture

Uses Netlify Functions to proxy NOAA/NDBC data and avoid CORS issues. Widget-based frontend with client-side caching.

```
src/
├── js/widgets/    # Individual components
├── data/          # Zone and station definitions  
└── index.html
functions/         # Netlify Functions for data proxying
```

## License

MIT License

## Data Sources

Data provided by NOAA National Weather Service and National Data Buoy Center.