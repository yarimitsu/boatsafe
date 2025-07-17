/**
 * Bight Watch - Main Application
 */
class BightWatchApp {
    constructor() {
        this.currentRegion = null;
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
            const savedRegion = localStorage.getItem('bightwatch_selected_region');
            if (savedRegion && this.zones.regions && this.zones.regions[savedRegion]) {
                this.currentRegion = savedRegion;
                this.widgets.locationSelector.setSelected(savedRegion);
                this.loadRegionForecastData(savedRegion);
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
     * Region selection handler
     * @param {string} regionId - Selected region ID
     */
    onZoneSelected(regionId) {
        console.log(`Region selected: ${regionId}, current region: ${this.currentRegion}`);
        if (regionId === this.currentRegion) {
            console.log('Same region selected, skipping reload');
            return;
        }
        
        this.currentRegion = regionId;
        console.log(`Loading new region: ${regionId}`);
        
        // Save preference
        try {
            localStorage.setItem('bightwatch_selected_region', regionId);
        } catch (error) {
            console.warn('Failed to save region preference:', error);
        }
        
        // Load forecast data for region
        this.loadRegionForecastData(regionId);
    }

    /**
     * Load forecast data for selected region
     * @param {string} regionId - Region ID
     */
    async loadRegionForecastData(regionId) {
        if (!regionId || !this.zones.regions[regionId]) {
            console.error('Invalid region ID:', regionId);
            return;
        }

        const region = this.zones.regions[regionId];
        this.showStatus(`Loading forecast for ${region.name}...`, 'loading');

        try {
            // Load marine forecast for the region
            const forecast = await this.loadRegionForecast(regionId, region);
            this.widgets.forecastSummary.updateRegion(region, forecast);

            // Load other data with explicit error handling
            const promises = [
                this.loadDiscussion(region.office).catch(err => {
                    console.warn('Discussion loading failed:', err);
                    return { error: 'Discussion not available', type: 'discussion' };
                }),
                this.loadAlerts().catch(err => {
                    console.warn('Alerts loading failed:', err);
                    return { features: [], error: 'Alerts not available', type: 'alerts' };
                }),
                this.loadTides(regionId).catch(err => {
                    console.warn('Tides loading failed:', err);
                    return { error: 'Tide data not available', type: 'tides' };
                }),
                this.loadObservations(regionId).catch(err => {
                    console.warn('Observations loading failed:', err);
                    return { error: 'Observation data not available', type: 'observations' };
                })
            ];

            const results = await Promise.allSettled(promises);

            // Update widgets with results
            results.forEach((result, index) => {
                const widgetNames = ['Discussion', 'Alerts', 'Tides', 'Observations'];
                console.log(`Widget ${index} (${widgetNames[index]}): status=${result.status}, value=`, result.value);
                
                if (result.status === 'fulfilled' && result.value && !result.value.error) {
                    switch (index) {
                        case 0: // Discussion
                            this.widgets.discussion.update(result.value);
                            console.log('Updated discussion widget');
                            break;
                        case 1: // Alerts
                            this.widgets.alerts.update(result.value);
                            console.log('Updated alerts widget');
                            break;
                        case 2: // Tides
                            this.widgets.tides.update(result.value);
                            console.log('Updated tides widget');
                            break;
                        case 3: // Observations
                            this.widgets.observations.update(result.value);
                            console.log('Updated observations widget');
                            break;
                    }
                } else {
                    const errorMsg = result.value?.error || result.reason || 'Data not available';
                    console.warn(`Failed to load data for widget ${index} (${widgetNames[index]}):`, errorMsg);
                    
                    // Show appropriate fallback for each widget
                    switch (index) {
                        case 0: // Discussion
                            this.widgets.discussion.showError('Discussion not available - using cached forecast data');
                            break;
                        case 1: // Alerts
                            this.widgets.alerts.showNoAlerts();
                            break;
                        case 2: // Tides
                            this.widgets.tides.showDefault();
                            break;
                        case 3: // Observations
                            this.widgets.observations.showError('Observation data not available - check individual buoy websites');
                            break;
                    }
                }
            });

            this.showStatus(`Loaded forecast for ${region.name}`, 'success');
            
        } catch (error) {
            console.error('Failed to load forecast data:', error);
            this.showStatus('Failed to load forecast', 'error');
        }
    }

    /**
     * Load region forecast
     * @param {string} regionId - Region ID
     * @param {Object} region - Region data
     * @returns {Promise} Parsed forecast data
     */
    async loadRegionForecast(regionId, region) {
        // Use current Netlify deployment proxy to get marine forecast data
        const currentHost = window.location.origin;
        // Use any zone from the region since they all map to the same forecast file
        const firstZone = Object.keys(region.zones)[0];
        const proxyUrl = `${currentHost}/.netlify/functions/marine-forecast/${firstZone.toUpperCase()}`;
        
        try {
            console.log(`Fetching forecast for region ${regionId} via proxy:`, proxyUrl);
            const data = await window.BightWatch.http.get(proxyUrl, { cacheTTL: 5, skipCache: true });
            console.log(`Proxy request succeeded for ${regionId}:`, data);
            
            // Return the complete forecast data for zone parsing
            if (data.properties && data.properties.periods) {
                return data;
            } else {
                throw new Error('No forecast data in proxy response');
            }
            
        } catch (error) {
            console.error('Proxy request failed:', error);
            throw new Error('Marine forecast data not available via proxy');
        }
    }

    /**
     * Parse NOAA text forecast into individual periods
     * @param {string} rawText - Raw NOAA text forecast
     * @returns {Array} Parsed forecast periods
     */
    parseNOAATextForecast(rawText) {
        const lines = rawText.split('\n');
        const periods = [];
        let currentPeriod = null;
        let stationName = '';
        let issueTime = '';
        
        // Extract station name and issue time
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Look for the station/zone name (usually after PKZ###-)
            if (line.includes('PKZ') && line.includes('-')) {
                const nextLine = lines[i + 1]?.trim();
                if (nextLine && !nextLine.includes('PM') && !nextLine.includes('AM')) {
                    stationName = nextLine;
                }
            }
            
            // Look for issue time
            if (line.includes('PM AKDT') || line.includes('AM AKDT')) {
                issueTime = line;
            }
            
            // Look for forecast periods (start with .)
            if (line.startsWith('.') && line.includes('...')) {
                // Save previous period
                if (currentPeriod) {
                    periods.push(currentPeriod);
                }
                
                // Start new period
                const periodName = line.replace(/^\./, '').replace(/\.\.\.$/, '').trim();
                currentPeriod = {
                    name: periodName,
                    text: '',
                    stationName,
                    issueTime
                };
            } else if (currentPeriod && line && !line.includes('$$') && !line.includes('Expires:')) {
                // Add to current period text
                currentPeriod.text += (currentPeriod.text ? ' ' : '') + line;
            }
        }
        
        // Add the last period
        if (currentPeriod) {
            periods.push(currentPeriod);
        }
        
        return periods;
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
        // Map zone IDs to tide stations
        const stationMap = {
            'PKZ011': '9452400', // Juneau
            'PKZ012': '9451054', // Sitka 
            'PKZ013': '9451054', // Sitka
            'PKZ125': '9454050', // Valdez - Prince William Sound
            'PKZ126': '9452400', // Juneau - Glacier Bay
            'PKZ127': '9452400', // Juneau - Icy Strait
            'PKZ128': '9451054', // Sitka - Cross Sound
            'PKZ129': '9452400', // Juneau - Chatham Strait
            'PKZ130': '9452400', // Juneau - Frederick Sound
            'PKZ131': '9452400', // Juneau - Stephens Passage
            'PKZ150': '9453220', // Kodiak
            'PKZ170': '9455920', // Anchorage - Cook Inlet
            'PKZ171': '9459450', // Homer - Kachemak Bay
            'PKZ172': '9453220', // Kodiak - Shelikof Strait
            'PKZ173': '9453220', // Kodiak
            'PKZ174': '9453220'  // Kodiak - Alaska Peninsula
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
            if (this.currentRegion && !document.hidden) {
                this.loadRegionForecastData(this.currentRegion);
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
            currentRegion: this.currentRegion,
            totalRegions: Object.keys(this.zones?.regions || {}).length,
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