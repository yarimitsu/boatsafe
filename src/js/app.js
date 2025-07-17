/**
 * Bight Watch - Main Application
 */
class BightWatchApp {
    constructor() {
        this.currentZone = null;
        this.zones = null;
        this.endpoints = null;
        this.widgets = {};
        this.statusBar = null;
        this.updateInterval = null;
        
        // Initialize app
        this.init();
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            this.showStatus('Initializing Bight Watch...', 'loading');
            
            // Load configuration data
            await this.loadConfig();
            
            // Initialize UI components
            this.initializeUI();
            
            // Load user preferences
            this.loadPreferences();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Start update cycle
            this.startUpdateCycle();
            
            this.showStatus('Ready', 'success');
        } catch (error) {
            console.error('App initialization failed:', error);
            this.showStatus('Initialization failed', 'error');
        }
    }

    /**
     * Load configuration data
     */
    async loadConfig() {
        try {
            const [zonesResponse, endpointsResponse] = await Promise.all([
                window.BightWatch.http.get('./data/zones.json', { cacheTTL: 1440 }), // 24 hours
                window.BightWatch.http.get('./data/endpoints.json', { cacheTTL: 1440 })
            ]);

            this.zones = typeof zonesResponse === 'string' ? JSON.parse(zonesResponse) : zonesResponse;
            this.endpoints = typeof endpointsResponse === 'string' ? JSON.parse(endpointsResponse) : endpointsResponse;
            
        } catch (error) {
            console.error('Failed to load configuration:', error);
            throw new Error('Configuration loading failed');
        }
    }

    /**
     * Initialize UI components
     */
    initializeUI() {
        // Initialize status bar
        this.statusBar = document.getElementById('status-bar');
        
        // Initialize widgets
        this.widgets = {
            locationSelector: new LocationSelector(this.zones, this.onZoneSelected.bind(this)),
            forecastSummary: new ForecastSummary(),
            discussion: new Discussion(),
            alerts: new Alerts(),
            tides: new Tides(),
            observations: new Observations()
        };
        
        console.log('UI components initialized');
    }

    /**
     * Load user preferences
     */
    loadPreferences() {
        try {
            const savedZone = localStorage.getItem('bightwatch_selected_zone');
            if (savedZone && this.zones[savedZone]) {
                this.currentZone = savedZone;
                this.widgets.locationSelector.setSelected(savedZone);
                this.loadForecastData(savedZone);
            }
        } catch (error) {
            console.warn('Failed to load preferences:', error);
        }
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stopUpdateCycle();
            } else {
                this.startUpdateCycle();
            }
        });

        // Handle online/offline events
        window.addEventListener('online', () => {
            this.showStatus('Back online', 'success');
            if (this.currentZone) {
                this.loadForecastData(this.currentZone);
            }
        });

        window.addEventListener('offline', () => {
            this.showStatus('Offline - using cached data', 'warning');
        });

        // Handle beforeunload
        window.addEventListener('beforeunload', () => {
            this.stopUpdateCycle();
        });
    }

    /**
     * Zone selection handler
     * @param {string} zoneId - Selected zone ID
     */
    onZoneSelected(zoneId) {
        if (zoneId === this.currentZone) return;
        
        this.currentZone = zoneId;
        
        // Save preference
        try {
            localStorage.setItem('bightwatch_selected_zone', zoneId);
        } catch (error) {
            console.warn('Failed to save zone preference:', error);
        }
        
        // Load forecast data
        this.loadForecastData(zoneId);
    }

    /**
     * Load forecast data for selected zone
     * @param {string} zoneId - Zone ID
     */
    async loadForecastData(zoneId) {
        if (!zoneId || !this.zones[zoneId]) {
            console.error('Invalid zone ID:', zoneId);
            return;
        }

        const zone = this.zones[zoneId];
        this.showStatus(`Loading forecast for ${zone.name}...`, 'loading');

        try {
            // Load marine forecast first
            const forecast = await this.loadCoastalForecast(zoneId, zone);
            this.widgets.forecastSummary.update(forecast);

            // Load other data with graceful fallbacks
            const promises = [
                this.loadDiscussion(zone.office).catch(() => null),
                this.loadAlerts().catch(() => ({ features: [] })),
                this.loadTides(zoneId).catch(() => null),
                this.loadObservations(zoneId).catch(() => null)
            ];

            const results = await Promise.allSettled(promises);

            // Update widgets with results
            results.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value) {
                    switch (index) {
                        case 0: // Discussion
                            this.widgets.discussion.update(result.value);
                            break;
                        case 1: // Alerts
                            this.widgets.alerts.update(result.value);
                            break;
                        case 2: // Tides
                            this.widgets.tides.update(result.value);
                            break;
                        case 3: // Observations
                            this.widgets.observations.update(result.value);
                            break;
                    }
                } else {
                    console.warn(`Failed to load data for widget ${index}:`, result.reason);
                    // Show placeholder message instead of error
                    switch (index) {
                        case 0:
                            this.widgets.discussion.showError('Discussion not available - using cached forecast data');
                            break;
                        case 1:
                            this.widgets.alerts.showNoAlerts();
                            break;
                        case 2:
                            this.widgets.tides.showDefault();
                            break;
                        case 3:
                            this.widgets.observations.showError('Observation data not available - check individual buoy websites');
                            break;
                    }
                }
            });

            this.showStatus(`Loaded forecast for ${zone.name}`, 'success');
            
        } catch (error) {
            console.error('Failed to load forecast data:', error);
            this.showStatus('Failed to load forecast', 'error');
        }
    }

    /**
     * Load coastal waters forecast
     * @param {string} zoneId - Zone ID
     * @param {Object} zone - Zone data
     * @returns {Promise} Parsed forecast data
     */
    async loadCoastalForecast(zoneId, zone) {
        // Use current Netlify deployment proxy to get marine forecast data
        const currentHost = window.location.origin;
        const proxyUrl = `${currentHost}/.netlify/functions/marine-forecast/${zoneId.toUpperCase()}`;
        
        try {
            console.log(`Fetching forecast via proxy:`, proxyUrl);
            const data = await window.BightWatch.http.get(proxyUrl, { cacheTTL: 30 });
            console.log(`Proxy request succeeded:`, data);
            
            // If we got forecast data, parse it
            if (data.properties && data.properties.periods) {
                const forecast = {
                    zoneName: zone.name,
                    issued: new Date(data.properties.updated),
                    periods: data.properties.periods.map(period => ({
                        name: period.name,
                        text: period.detailedForecast,
                        wind: this.parseNWSWind(period.detailedForecast),
                        waves: this.parseNWSWaves(period.detailedForecast),
                        weather: this.parseNWSWeather(period.detailedForecast),
                        summary: period.shortForecast
                    }))
                };
                
                return forecast;
            } else {
                throw new Error('No forecast data in proxy response');
            }
            
        } catch (error) {
            console.error('Proxy request failed:', error);
            throw new Error('Marine forecast data not available via proxy');
        }
    }

    /**
     * Parse wind information from NWS forecast text
     * @param {string} text - Forecast text
     * @returns {Object|null} Wind data
     */
    parseNWSWind(text) {
        const windPattern = /(\w+)\s+wind(?:s)?\s+(\d+)(?:\s*to\s*(\d+))?\s*(?:mph|knots?)/i;
        const match = text.match(windPattern);
        
        if (match) {
            const direction = match[1].toUpperCase();
            const speed = parseInt(match[2]);
            const maxSpeed = match[3] ? parseInt(match[3]) : null;
            
            return {
                direction,
                directionName: this.getWindDirectionName(direction),
                speed,
                maxSpeed,
                description: this.getWindDescription(speed)
            };
        }
        return null;
    }

    /**
     * Parse wave information from NWS forecast text
     * @param {string} text - Forecast text
     * @returns {Object|null} Wave data
     */
    parseNWSWaves(text) {
        const wavePattern = /(?:waves?|seas?)\s+(\d+)(?:\s*to\s*(\d+))?\s*(?:feet|ft)/i;
        const match = text.match(wavePattern);
        
        if (match) {
            const height = parseInt(match[1]);
            const maxHeight = match[2] ? parseInt(match[2]) : null;
            
            return {
                height,
                maxHeight,
                description: this.getWaveDescription(height)
            };
        }
        return null;
    }

    /**
     * Parse weather conditions from NWS forecast text
     * @param {string} text - Forecast text
     * @returns {Object|null} Weather data
     */
    parseNWSWeather(text) {
        const weatherKeywords = ['rain', 'showers', 'thunderstorms', 'fog', 'snow', 'clear', 'cloudy', 'sunny'];
        const foundWeather = weatherKeywords.filter(keyword => 
            text.toLowerCase().includes(keyword)
        );
        
        return foundWeather.length > 0 ? {
            conditions: foundWeather,
            description: foundWeather.join(', ')
        } : null;
    }

    /**
     * Get wind direction name
     * @param {string} direction - Wind direction abbreviation
     * @returns {string} Full direction name
     */
    getWindDirectionName(direction) {
        const directions = {
            'N': 'North', 'NE': 'Northeast', 'E': 'East', 'SE': 'Southeast',
            'S': 'South', 'SW': 'Southwest', 'W': 'West', 'NW': 'Northwest'
        };
        return directions[direction.toUpperCase()] || direction;
    }

    /**
     * Get wind description based on speed
     * @param {number} speed - Wind speed
     * @returns {string} Description
     */
    getWindDescription(speed) {
        if (speed < 7) return 'Light';
        if (speed < 17) return 'Moderate';
        if (speed < 27) return 'Fresh';
        if (speed < 34) return 'Strong';
        return 'Gale';
    }

    /**
     * Get wave description based on height
     * @param {number} height - Wave height in feet
     * @returns {string} Description
     */
    getWaveDescription(height) {
        if (height < 2) return 'Calm';
        if (height < 4) return 'Light';
        if (height < 6) return 'Moderate';
        if (height < 10) return 'Rough';
        return 'Very rough';
    }

    /**
     * Load area forecast discussion
     * @param {string} office - Forecast office
     * @returns {Promise} Discussion data
     */
    async loadDiscussion(office) {
        const endpoint = this.endpoints.discussion;
        const url = endpoint.baseUrl + endpoint.format.replace('{office}', office.toUpperCase());

        try {
            const data = await window.BightWatch.http.get(url, { cacheTTL: 180 });
            
            // Get the most recent discussion
            const latestProduct = data.features && data.features.length > 0 ? data.features[0] : null;
            
            if (latestProduct) {
                return {
                    office,
                    text: latestProduct.properties.productText,
                    issued: new Date(latestProduct.properties.issuanceTime)
                };
            } else {
                throw new Error('No AFD products found');
            }
        } catch (error) {
            console.error('Failed to load discussion:', error);
            throw new Error('Forecast discussion not available');
        }
    }

    /**
     * Load marine alerts
     * @returns {Promise} Alerts data
     */
    async loadAlerts() {
        const endpoint = this.endpoints.alerts;
        const url = endpoint.baseUrl + endpoint.format;

        try {
            const data = await window.BightWatch.http.get(url, { cacheTTL: 10 });
            return data;
        } catch (error) {
            console.error('Failed to load alerts:', error);
            return { features: [] };
        }
    }

    /**
     * Load tide data
     * @param {string} zoneId - Zone ID
     * @returns {Promise} Tide data
     */
    async loadTides(zoneId) {
        // This is a placeholder - in production, you'd map zones to tide stations
        const station = this.getTideStation(zoneId);
        if (!station) {
            throw new Error('No tide station mapped for this zone');
        }

        const endpoint = this.endpoints.tides;
        const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const url = endpoint.baseUrl + endpoint.format
            .replace(/{date}/g, today)
            .replace(/{station}/g, station);

        try {
            const data = await window.BightWatch.http.get(url, { cacheTTL: 1440 });
            return data;
        } catch (error) {
            console.error('Failed to load tides:', error);
            throw new Error('Tide data not available');
        }
    }

    /**
     * Load buoy observations
     * @param {string} zoneId - Zone ID
     * @returns {Promise} Observations data
     */
    async loadObservations(zoneId) {
        // This is a placeholder - in production, you'd map zones to buoy stations
        const stations = this.getBuoyStations(zoneId);
        if (!stations || stations.length === 0) {
            throw new Error('No buoy stations mapped for this zone');
        }

        const endpoint = this.endpoints.buoy;
        const promises = stations.map(station => {
            const url = endpoint.baseUrl + endpoint.format.replace('{station}', station);
            return window.BightWatch.http.get(url, { cacheTTL: 10 });
        });

        try {
            const results = await Promise.allSettled(promises);
            const observations = results
                .filter(result => result.status === 'fulfilled')
                .map(result => result.value);
            
            return observations;
        } catch (error) {
            console.error('Failed to load observations:', error);
            throw new Error('Observation data not available');
        }
    }

    /**
     * Get tide station for zone (placeholder)
     * @param {string} zoneId - Zone ID
     * @returns {string|null} Station ID
     */
    getTideStation(zoneId) {
        // Map current zone IDs to tide stations
        const stationMap = {
            'PKZ011': '9452400', // Juneau - Southeast Alaska Inside Waters
            'PKZ012': '9451054', // Sitka - Southeast Alaska Coastal Waters  
            'PKZ013': '9451054', // Sitka - Southeast Alaska Offshore Waters
            'PKZ021': '9455920', // Anchorage - Southcentral Alaska Inside Waters
            'PKZ022': '9454050', // Valdez - Southcentral Alaska Coastal Waters
            'PKZ031': '9459450', // Homer - Western Alaska Inside Waters
            'PKZ032': '9453220', // Kodiak - Western Alaska Coastal Waters
            'PKZ033': '9453220', // Kodiak - Bering Sea Waters
            'PKZ034': '9453220', // Kodiak - Aleutian Waters
            'PKZ035': '9453220'  // Kodiak - Arctic Ocean Waters
        };
        
        return stationMap[zoneId] || null;
    }

    /**
     * Get buoy stations for zone (placeholder)
     * @param {string} zoneId - Zone ID
     * @returns {Array} Station IDs
     */
    getBuoyStations(zoneId) {
        // Map current zone IDs to buoy stations
        const stationMap = {
            'PKZ011': ['46082'], // Southeast Alaska Inside Waters
            'PKZ012': ['46082'], // Southeast Alaska Coastal Waters
            'PKZ013': ['46082'], // Southeast Alaska Offshore Waters  
            'PKZ021': ['46060'], // Southcentral Alaska Inside Waters
            'PKZ022': ['46060'], // Southcentral Alaska Coastal Waters
            'PKZ031': ['46001'], // Western Alaska Inside Waters
            'PKZ032': ['46001'], // Western Alaska Coastal Waters
            'PKZ033': ['46001'], // Bering Sea Waters
            'PKZ034': ['46001'], // Aleutian Waters
            'PKZ035': ['46001']  // Arctic Ocean Waters
        };
        
        return stationMap[zoneId] || [];
    }

    /**
     * Start update cycle
     */
    startUpdateCycle() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        // Update every 30 minutes
        this.updateInterval = setInterval(() => {
            if (this.currentZone && !document.hidden) {
                this.loadForecastData(this.currentZone);
            }
        }, 30 * 60 * 1000);
    }

    /**
     * Stop update cycle
     */
    stopUpdateCycle() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    /**
     * Show status message
     * @param {string} message - Status message
     * @param {string} type - Status type (success, warning, error, loading)
     */
    showStatus(message, type = 'info') {
        if (!this.statusBar) return;

        const statusText = this.statusBar.querySelector('.status-text');
        const statusIndicator = this.statusBar.querySelector('.status-indicator');
        
        if (statusText) {
            statusText.textContent = message;
        }
        
        if (statusIndicator) {
            statusIndicator.className = `status-indicator ${type}`;
        }
        
        // Auto-hide success messages
        if (type === 'success') {
            setTimeout(() => {
                if (statusText) {
                    statusText.textContent = 'Ready';
                }
                if (statusIndicator) {
                    statusIndicator.className = 'status-indicator';
                }
            }, 3000);
        }
    }

    /**
     * Get app statistics
     * @returns {Object} App statistics
     */
    getStats() {
        return {
            currentZone: this.currentZone,
            totalZones: Object.keys(this.zones || {}).length,
            cache: window.BightWatch.cache.getStats(),
            lastUpdate: new Date().toISOString()
        };
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.BightWatch = window.BightWatch || {};
    window.BightWatch.app = new BightWatchApp();
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    if (window.BightWatch && window.BightWatch.app) {
        window.BightWatch.app.showStatus('An error occurred', 'error');
    }
});

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BightWatchApp;
}