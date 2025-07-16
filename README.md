# Bight Watch
**A Marine Forecast App for Alaska Waters**


## Features

- **Location-Specific Forecasts**: Select from Southeast and Southcentral Alaska marine zones
- **Smart Summarization**: Converts technical NOAA forecasts into actionable marine conditions
- **Forecaster Insights**: Key points from meteorologist discussions (AFD)
- **Real-Time Alerts**: Marine warnings and advisories
- **Privacy-First**: No tracking, no data collection, no external dependencies
- **Mobile-Optimized**: Responsive design for phones and tablets
- **Offline Capable**: Cached forecasts work without internet

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
git clone https://github.com/yourusername/bight-watch.git
cd bight-watch
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

### Deploy to GitHub Pages
```bash
npm run deploy
# Builds and pushes to gh-pages branch
```

## Project Structure

```
bight-watch/
├── src/
│   ├── js/
│   │   ├── app.js              # Main application logic
│   │   ├── forecast-parser.js  # NOAA data parsing
│   │   ├── widgets/           # Individual widget components
│   │   └── utils/             # Utility functions
│   ├── css/
│   │   ├── main.css           # Core styles
│   │   └── widgets.css        # Widget-specific styles
│   ├── data/
│   │   ├── zones.json         # Marine zone definitions
│   │   └── endpoints.json     # API endpoint templates
│   └── index.html
├── scripts/
│   ├── build-zones.js         # Generate zone data
│   └── deploy.js              # Deployment script
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
- **LocationSelector**: Zone picker with search
- **ForecastSummary**: Parsed marine conditions
- **Discussion**: Meteorologist insights
- **Alerts**: Active warnings/advisories
- **Tides**: High/low tide information
- **Observations**: Latest buoy data

### Data Flow
1. User selects marine zone (stored locally)
2. App fetches NOAA data directly from public APIs
3. Client-side parsing and summarization
4. Display formatted results
5. Cache responses for performance

## Configuration

### Marine Zones
Add zones to `src/data/zones.json`:
```json
{
  "PKZ125": {
    "name": "Lynn Canal",
    "office": "AJK",
    "region": "Southeast Alaska"
  }
}
```

### API Endpoints
Configure in `src/data/endpoints.json`:
```json
{
  "cwf": "https://tgftp.nws.noaa.gov/data/raw/fz/",
  "afd": "https://forecast.weather.gov/product.php",
  "tides": "https://tidesandcurrents.noaa.gov/api/"
}
```

## Security

### Content Security Policy
Strict CSP allows only necessary domains:
- `tgftp.nws.noaa.gov` (forecasts)
- `tidesandcurrents.noaa.gov` (tide data)
- `api.weather.gov` (alerts)
- `www.ndbc.noaa.gov` (buoy data)

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

**Bight Watch** - Keeping mariners informed and safe in Alaska waters