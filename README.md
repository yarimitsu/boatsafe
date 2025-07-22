# <img src="oceanbightlogo.png" alt="Ocean Bight" width="32" height="32"> Boat Safe
**Marine forecasts for Alaska waters**

A simple marine weather application displaying NOAA data for Alaska coastal waters.

## Features

- **Marine Forecast** - NOAA marine forecasts by region and zone
- **SEAK Observations** - Southeast Alaska marine observations from 92+ stations
- **Tides** - Tide predictions with date navigation for Alaska stations
- **Forecast Discussion** - Collapsible meteorologist analysis for 3 Alaska regions
- **Weather Warnings** - Current weather warnings and advisories
- **Coastal Forecasts** - All 7 Alaska coastal forecast regions

## Quick Start

```bash
git clone https://github.com/yarimitsu/boatsafe.git
cd boatsafe
npm install
npm start
```

Deploys to Netlify automatically on push to main.

## Technical Notes

- **Frontend**: Vanilla JavaScript, CSS Grid/Flexbox
- **Backend**: Netlify Functions for CORS proxy
- **Data**: NOAA National Weather Service, NDBC, NOAA Tides & Currents
- **Responsive**: Mobile and desktop optimized

## Project Structure

```
src/
├── js/widgets/     # Widget components
├── css/           # Styles  
└── index.html     # Main page
functions/         # Netlify Functions
```

## Data Sources

Data provided by NOAA National Weather Service and National Data Buoy Center.

## License

MIT License

## Disclaimer

For emergency situations, always consult official NOAA marine forecasts and local authorities.