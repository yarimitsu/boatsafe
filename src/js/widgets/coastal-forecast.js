/**
 * Coastal Forecast Widget
 */
class CoastalForecast {
    constructor() {
        this.container = document.getElementById('coastal-forecast');
        this.content = this.container.querySelector('.coastal-forecast-content');
        this.regionDropdown = document.getElementById('coastal-region-dropdown');
        this.locationDropdown = document.getElementById('coastal-location-dropdown');
        this.forecastDisplay = this.container.querySelector('.coastal-forecast-display');
        this.currentData = null;
        this.currentRegion = null;
        this.selectedLocation = null;
        this.stations = null;
        
        this.init();
    }

    /**
     * Initialize the widget
     */
    init() {
        this.showLoading();
        this.setupEventListeners();
        this.loadStations();
    }

    /**
     * Load stations data and populate region dropdown
     */
    async loadStations() {
        try {
            const response = await window.BoatSafe.http.get('./data/coastal-stations.json', { cacheTTL: 1440 });
            this.stations = typeof response === 'string' ? JSON.parse(response) : response;
            this.populateRegionDropdown();
        } catch (error) {
            console.error('Failed to load coastal stations:', error);
            this.showError('Failed to load coastal stations data');
        }
    }

    /**
     * Populate region dropdown
     */
    populateRegionDropdown() {
        if (!this.regionDropdown || !this.stations?.regions) return;

        this.regionDropdown.innerHTML = '<option value="">Select a region...</option>';
        
        Object.entries(this.stations.regions).forEach(([regionId, region]) => {
            const option = document.createElement('option');
            option.value = regionId;
            option.textContent = region.name;
            this.regionDropdown.appendChild(option);
        });
        
        // Restore saved region if available
        this.restorePreferences();
    }

    /**
     * Populate location dropdown for current region
     */
    populateLocationDropdown() {
        if (!this.locationDropdown || !this.currentRegion) return;

        // Clear existing options
        this.locationDropdown.innerHTML = '<option value="">Select a zone...</option>';

        // Add zones for current region
        if (this.stations?.regions[this.currentRegion]?.zones) {
            Object.entries(this.stations.regions[this.currentRegion].zones).forEach(([zoneId, zoneName]) => {
                const option = document.createElement('option');
                option.value = zoneId;
                option.textContent = `${zoneId} - ${zoneName}`;
                this.locationDropdown.appendChild(option);
            });
        }
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        if (this.regionDropdown) {
            this.regionDropdown.addEventListener('change', (e) => {
                const regionId = e.target.value;
                this.selectRegion(regionId);
            });
        }
        
        if (this.locationDropdown) {
            this.locationDropdown.addEventListener('change', (e) => {
                const location = e.target.value;
                this.selectLocation(location);
            });
        }
    }

    /**
     * Select a region and populate location dropdown
     * @param {string} regionId - Region ID
     */
    selectRegion(regionId) {
        if (!regionId || !this.stations?.regions[regionId]) {
            this.locationDropdown.innerHTML = '<option value="">Select a region first...</option>';
            this.showLoading('Select a region to view forecast');
            return;
        }

        this.currentRegion = regionId;
        this.populateLocationDropdown();
        
        // Save region preference
        try {
            localStorage.setItem('boatsafe_coastal_region', regionId);
        } catch (error) {
            console.warn('Failed to save region preference:', error);
        }
        
        // Show zone selection message
        this.showLoading('Select a zone to view forecast');
    }

    /**
     * Select and display forecast for specific zone
     * @param {string} zoneId - Zone ID to display
     */
    async selectLocation(zoneId) {
        if (!zoneId || !this.currentRegion) {
            this.showLoading('Select a zone to view forecast');
            return;
        }

        this.selectedLocation = zoneId;
        this.showLoading(`Loading coastal forecast for ${zoneId}...`);
        
        try {
            // Fetch forecast data for this region
            const currentHost = window.location.origin;
            const isLocal = currentHost.includes('localhost') || currentHost.includes('127.0.0.1');
            
            let data;
            if (isLocal) {
                // Local development - show placeholder
                const zoneName = this.stations.regions[this.currentRegion]?.zones[zoneId] || zoneId;
                data = {
                    properties: {
                        updated: new Date().toISOString(),
                        periods: [{
                            name: 'Coastal Forecast',
                            detailedForecast: `LOCAL DEVELOPMENT MODE\n\nCoastal forecast for ${zoneName} (${zoneId}) would appear here.\n\nDeploy to Netlify to see real coastal forecast data from:\nhttps://www.weather.gov/arh/lfpfcst.html?AJK=${zoneId}`,
                            shortForecast: `Local dev mode - ${zoneId}`
                        }]
                    }
                };
            } else {
                // Production - use Netlify function with zone-specific URL
                const proxyUrl = `${currentHost}/.netlify/functions/coastal-forecast/${zoneId}`;
                console.log(`Fetching coastal forecast for ${zoneId} from:`, proxyUrl);
                const response = await fetch(proxyUrl);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                data = await response.json();
            }
            
            console.log('Received coastal forecast data:', data);
            
            if (data.properties && data.properties.periods) {
                this.currentData = data;
                this.renderZoneForecast(zoneId);
                
                // Save location preference
                try {
                    localStorage.setItem('boatsafe_coastal_location', zoneId);
                } catch (error) {
                    console.warn('Failed to save location preference:', error);
                }
            } else {
                throw new Error('No forecast data received - invalid response structure');
            }
        } catch (error) {
            console.error('Failed to load coastal forecast:', error);
            this.showError(`Failed to load coastal forecast for ${this.currentRegion}: ${error.message}`);
        }
    }

    /**
     * Render forecast for entire region
     */
    renderRegionForecast() {
        if (!this.currentData || !this.currentData.properties) {
            this.showError('No forecast data available');
            return;
        }

        const regionName = this.currentData.regionName || this.currentRegion;
        const fullText = this.currentData.properties.fullText || this.currentData.properties.periods[0].detailedForecast;
        
        // Streamlined for low bandwidth - minimal HTML following forecast-summary pattern
        const html = `
            <div class="forecast-header">
                <strong>${this.currentRegion} - ${regionName}</strong>
                <div class="forecast-meta">
                    <small>NOAA Update: ${this.formatDate(new Date(this.currentData.properties.updated))}</small>
                    <a href="https://www.weather.gov/marine/forecast#bay" target="_blank" rel="noopener" class="noaa-link">View NOAA Dataset →</a>
                </div>
            </div>
            <div class="region-forecast">
                <pre class="forecast-text">${fullText}</pre>
            </div>
        `;

        if (this.forecastDisplay) {
            this.forecastDisplay.innerHTML = html;
        } else {
            this.content.innerHTML = html;
        }
    }

    /**
     * Render forecast for specific zone (matching Marine Forecasts widget style)
     * @param {string} zoneId - Zone ID to render
     */
    renderZoneForecast(zoneId) {
        if (!this.currentData || !this.currentData.properties || !this.currentData.properties.periods) {
            this.showError('No forecast data available');
            return;
        }

        const fullText = this.currentData.properties.periods[0].detailedForecast;
        const zoneName = this.stations?.regions[this.currentRegion]?.zones[zoneId] || zoneId;
        
        // Streamlined for low bandwidth - minimal HTML matching forecast-summary pattern
        const html = `
            <div class="forecast-header">
                <strong>${zoneId} - ${zoneName}</strong>
                <div class="forecast-meta">
                    <small>NOAA Update: ${this.formatDate(new Date(this.currentData.properties.updated))}</small>
                    <a href="https://www.weather.gov/arh/lfpfcst.html?AJK=${zoneId}" target="_blank" rel="noopener" class="noaa-link">View NOAA Dataset →</a>
                </div>
            </div>
            <div class="zone-forecast">
                <pre class="forecast-text">${fullText}</pre>
            </div>
        `;

        if (this.forecastDisplay) {
            this.forecastDisplay.innerHTML = html;
        } else {
            this.content.innerHTML = html;
        }
    }

    /**
     * Restore saved preferences
     */
    restorePreferences() {
        try {
            const savedRegion = localStorage.getItem('boatsafe_coastal_region');
            if (savedRegion && this.stations?.regions[savedRegion]) {
                this.regionDropdown.value = savedRegion;
                this.selectRegion(savedRegion);
                
                // Also restore saved location if available
                setTimeout(() => {
                    const savedLocation = localStorage.getItem('boatsafe_coastal_location');
                    if (savedLocation) {
                        this.locationDropdown.value = savedLocation;
                        this.selectLocation(savedLocation);
                    }
                }, 100);
            }
        } catch (error) {
            console.warn('Failed to restore preferences:', error);
        }
    }

    /**
     * Format date for display
     * @param {Date} date - Date object
     * @returns {string} Formatted date string
     */
    formatDate(date) {
        if (!date) return 'Unknown';
        
        try {
            const now = new Date();
            const diffMinutes = Math.floor((now - date) / (1000 * 60));
            
            if (diffMinutes < 60) {
                return `${diffMinutes} minutes ago`;
            } else if (diffMinutes < 1440) {
                return `${Math.floor(diffMinutes / 60)} hours ago`;
            } else {
                return date.toLocaleDateString();
            }
        } catch (error) {
            return 'Unknown';
        }
    }

    /**
     * Show loading state
     */
    showLoading(message = 'Loading coastal forecast...') {
        const content = this.forecastDisplay || this.content;
        content.innerHTML = `<div class="loading">${message}</div>`;
    }

    /**
     * Show error state
     * @param {string} message - Error message
     */
    showError(message) {
        const content = this.forecastDisplay || this.content;
        content.innerHTML = `
            <div class="status-message status-error">
                <strong>Error:</strong> ${message}
            </div>
        `;
    }

    /**
     * Clear widget content
     */
    clear() {
        this.currentData = null;
        this.currentRegion = null;
        this.selectedLocation = null;
        const content = this.forecastDisplay || this.content;
        content.innerHTML = '<div class="loading">Select a region to view coastal forecast</div>';
    }

    /**
     * Get current forecast data
     * @returns {Object|null} Current forecast data
     */
    getData() {
        return this.currentData;
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.CoastalForecast = CoastalForecast;
}