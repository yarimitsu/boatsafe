# Boat Safe
**A Marine Forecast App for Alaska Waters**


## Features

- **Location-Specific Forecasts**: Select from Southeast and Southcentral Alaska marine zones
- **Smart Summarization**: Converts technical NOAA forecasts into actionable marine conditions
- **Forecaster Insights**: Key points from meteorologist discussions (AFD)
- **Real-Time Alerts**: Marine warnings and advisories
- **Privacy-First**: No tracking, no data collection, no external dependencies
- **Mobile-Optimized**: Responsive design for phones and tablets
- **Offline Capable**: Cached forecasts work without internet
- **Progressive Web App**: Installable on mobile devices with offline capabilities
- **Netlify Edge Functions**: Secure proxy for NOAA data with rate limiting

## Architecture

### Data Sources (All Free)
- **NOAA Coastal Waters Forecasts** (CWF): Zone-specific marine forecasts
- **Area Forecast Discussions** (AFD): Meteorologist analysis and insights
- **Special Marine Warnings** (SMW): Emergency marine conditions
- **Marine Weather Statements** (MWS): Updates and clarifications
- **Tide Data**: NOAA Tides & Currents API
- **Buoy Observations**: NDBC real-time data

### Coverage Areas
- **Southeast Alaska** (AJK): Juneau Weather Forecast Office zones
- **Southcentral Alaska** (AFC): Anchorage office zones (Gulf Coast, Cook Inlet, Kodiak, Aleutians)

### Privacy & Security
- **Zero Data Collection**: No user tracking, analytics, or personal data storage
- **Client-Side Only**: All processing happens in browser
- **Local Storage**: User preferences saved only on device
- **No External Dependencies**: Self-hosted assets, no CDNs or tracking scripts
- **Content Security Policy**: Strict CSP headers for security

## Development

### Prerequisites
- Node.js 18+
- Modern web browser with ES6 support

### Installation
```bash
git clone https://github.com/yarimitsu/boatsafe.git
cd boatsafe
npm install
```

### Development Server
```bash
npm start
# Opens http://localhost:3000
```

### Build for Production
```bash
npm run build
# Generates optimized static files in ./dist
```

### Deploy to Netlify
The app is automatically deployed to Netlify when changes are pushed to the main branch.
Live deployment: https://boatsafe.oceanbight.com

### Custom Domain Setup
To use a custom domain with Netlify:
1. Go to your Netlify dashboard
2. Navigate to Site Settings → Domain Management
3. Add your custom domain (e.g., bightwatch.com)
4. Configure DNS settings as provided by Netlify
5. SSL certificates are automatically provisioned

## Project Structure

```
boatsafe/
├── src/
│   ├── js/
│   │   ├── app.js              # Main application logic
│   │   ├── forecast-parser.js  # NOAA data parsing
│   │   ├── widgets/           # Individual widget components
│   │   │   ├── location-selector.js
│   │   │   ├── forecast-summary.js
│   │   │   ├── alerts.js
│   │   │   ├── discussion.js
│   │   │   ├── tides.js
│   │   │   └── observations.js
│   │   └── utils/             # Utility functions
│   │       ├── cache.js       # Client-side caching
│   │       └── http.js        # HTTP client with retry logic
│   ├── css/
│   │   ├── main.css           # Core styles
│   │   └── widgets.css        # Widget-specific styles
│   ├── data/
│   │   ├── zones.json         # Marine zone definitions
│   │   ├── endpoints.json     # API endpoint templates
│   │   └── tide-stations.json # Tide station mappings
│   ├── manifest.json          # PWA manifest
│   └── index.html
├── functions/
│   └── marine-forecast.js     # Netlify function for NOAA proxy
├── scripts/
│   ├── build.js               # Build script
│   └── deploy.js              # Deployment script
├── netlify.toml               # Netlify configuration
└── README.md
```

## Key Components

### Forecast Parser (`src/js/forecast-parser.js`)
Parses NOAA text forecasts into structured data:
- Wind speed/direction with plain language summaries
- Wave height/period with trend indicators
- Weather conditions and timing
- Warning/advisory extraction

### Widget System (`src/js/widgets/`)
- **LocationSelector**: Region/zone picker with dropdown interface
- **ForecastSummary**: Parsed marine conditions with zone-specific display
- **Discussion**: Meteorologist insights from Area Forecast Discussions
- **Alerts**: Active warnings/advisories with real-time updates
- **Tides**: High/low tide information for regional tide stations
- **Observations**: Latest buoy data from NDBC stations

### Data Flow
1. User selects marine region, then specific zone (stored locally)
2. App fetches NOAA data via secure Netlify proxy functions
3. Client-side parsing and zone-specific extraction
4. Display formatted results with caching
5. Real-time updates every 30 minutes when active

## Configuration

### Marine Zones
The app uses a structured zone configuration in `src/data/zones.json`:
```json
{
  "regions": {
    "southeast": {
      "name": "Southeast Alaska",
      "forecastFile": "FZAK51.PAJK",
      "office": "AJK",
      "zones": {
        "PKZ125": "Prince William Sound",
        "PKZ126": "Glacier Bay"
      }
    }
  }
}
```

### API Endpoints
Configure in `src/data/endpoints.json`:
```json
{
  "alerts": {
    "baseUrl": "https://api.weather.gov/alerts",
    "format": "?area=AK&urgency=Expected,Immediate&severity=Minor,Moderate,Severe,Extreme&status=Actual"
  },
  "tides": {
    "baseUrl": "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter",
    "format": "?begin_date={date}&end_date={date}&station={station}&product=predictions&datum=MLLW&time_zone=lst_ldt&units=english&format=json"
  }
}
```

## Security

### Content Security Policy
Strict CSP allows only necessary domains:
- `tgftp.nws.noaa.gov` (forecasts)
- `tidesandcurrents.noaa.gov` (tide data)
- `api.weather.gov` (alerts)
- `www.ndbc.noaa.gov` (buoy data)
- `fonts.googleapis.com` (web fonts)

### Netlify Functions Security
- Rate limiting: 60 requests/hour per IP
- Zone ID validation against whitelist
- CORS headers properly configured
- No sensitive data exposure

### No External Dependencies
All assets self-hosted to prevent tracking and ensure reliability.

## Performance

### Caching Strategy
- **Forecasts**: 30-minute cache minimum
- **Discussions**: 3-hour cache
- **Observations**: 10-minute cache
- **Tides**: 24-hour cache

### Optimization
- Gzip compression
- Minified assets
- Conditional requests (If-Modified-Since)
- Progressive loading

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Code Style
- ES6+ JavaScript
- CSS Grid/Flexbox for layouts
- Mobile-first responsive design
- Semantic HTML
- Accessible components

## License

MIT License - See LICENSE file for details

## Acknowledgments

- **NOAA National Weather Service** for providing free, public marine forecast data
- **Marine forecasters** in Alaska for their critical safety work
- **Open source community** for development tools and inspiration

## Support

For issues or questions:
- Open GitHub issue
- Contact: [info@oceanbight.com]
- Marine consulting services: [your-business-website.com]

---

**Boat Safe** - Keeping mariners informed and safe in Alaska waters