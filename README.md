# Boat Safe
**A Marine Forecast App for Alaska Waters**

## Features

- **Comprehensive Coverage**: 5 Alaska marine regions with 70+ individual zones
- **Real-Time Buoy Data**: 48 Alaska NDBC stations with current conditions
- **Zone-Specific Forecasts**: NOAA marine forecasts for exact locations
- **Low-Bandwidth Optimized**: Fast loading for intermittent cell service
- **Privacy-First**: No tracking, no data collection, client-side only
- **Mobile-Optimized**: Responsive design for phones and tablets
- **Progressive Web App**: Installable on mobile devices with offline capabilities
- **Netlify Functions**: Secure proxy for NOAA data with rate limiting

## Architecture

### Data Sources (All Free)
- **NOAA Marine Forecasts**: Direct text forecasts from 5 Alaska coastal regions
- **NDBC Buoy Data**: Real-time observations from 48 Alaska stations
- **Marine Alerts**: NOAA weather warnings and advisories

### Coverage Areas
- **SE Inner Coastal Waters**: 12 zones (Juneau office)
- **SE Outside Coastal Waters**: 12 zones (offshore)
- **Yakutat Bay**: 1 zone (specialized coverage)
- **North Gulf Coast**: 22 zones (Kodiak, Cook Inlet, PWS)
- **Southwest Alaska & Aleutians**: 23 zones (Bering Sea, Aleutians)

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
- **ForecastSummary**: Region/zone selection with zone-specific forecasts
- **Observations**: NDBC buoy station selection with real-time data
- **Alerts**: Active warnings/advisories (future enhancement)
- **Discussion**: Meteorologist insights (future enhancement)
- **Tides**: Tide information (future enhancement)

### Data Flow
1. User selects marine region, then specific zone (stored locally)
2. App fetches NOAA forecast via secure Netlify proxy functions
3. Zone-specific forecast extracted and displayed
4. User selects NDBC buoy station for current conditions
5. Real-time buoy data fetched and parsed
6. All data cached for offline use (30-minute TTL)

## Configuration

### Marine Zones
The app uses a structured zone configuration in `src/data/zones.json`:
```json
{
  "regions": {
    "se_inner": {
      "name": "SE Inner Coastal Waters",
      "forecastUrl": "https://tgftp.nws.noaa.gov/data/raw/fz/fzak51.pajk.cwf.ajk.txt",
      "office": "AJK",
      "zones": {
        "PKZ011": "Glacier Bay",
        "PKZ012": "Northern Lynn Canal"
      }
    }
  }
}
```

### NDBC Buoy Stations
Real-time data from 48 Alaska stations including:
- **Offshore Buoys**: 46001 (Western Gulf), 46060 (West Orca Bay), 46082 (Cape Suckling)
- **Coastal Stations**: AJXA2 (Juneau), ANTA2 (Anchorage), NMTA2 (Nome)
- **Direct NDBC URLs**: `https://www.ndbc.noaa.gov/data/realtime2/{station}.txt`

## Security

### Content Security Policy
Strict CSP allows only necessary domains:
- `tgftp.nws.noaa.gov` (marine forecasts)
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
- **Marine Forecasts**: 30-minute cache via Netlify functions
- **Buoy Observations**: Direct fetch from NDBC (real-time)
- **Zone/Station Data**: 24-hour cache in localStorage

### Optimization
- **Low-bandwidth design**: Minimal HTML, efficient caching
- **Progressive loading**: Zone data loaded on demand
- **Local development mode**: Placeholder data for offline development
- **Responsive design**: Mobile-first for marine use

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