/**
 * Coastal Forecast Widget
 */
class CoastalForecast {
    constructor() {
        this.container = document.getElementById('coastal-forecast');
        this.content = this.container.querySelector('.coastal-forecast-content');
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
            const response = await window.BoatSafe.http.get('./data/coastal-stations.json', { skipCache: true, cacheTTL: 0 });
            this.stations = typeof response === 'string' ? JSON.parse(response) : response;
            this.initRegion();
        } catch (error) {
            console.error('Failed to load coastal stations:', error);
            this.showError('Failed to load coastal stations data');
        }
    }

    /**
     * Auto-select the (single) region and populate the location dropdown.
     * There's only one region now, so no region picker is shown.
     */
    initRegion() {
        const ids = Object.keys(this.stations?.regions || {});
        if (ids.length === 0) return;

        this.currentRegion = ids[0];
        this.populateLocationDropdown();
        this.showLoading('Select a location to view forecast');

        // Restore saved location, if it's still a valid zone
        try {
            const saved = localStorage.getItem('boatsafe_coastal_location');
            if (saved && this.stations.regions[this.currentRegion].zones[saved]) {
                this.locationDropdown.value = saved;
                this.selectLocation(saved);
            }
        } catch (error) {
            console.warn('Failed to restore coastal location:', error);
        }
    }

    /**
     * Populate location dropdown for current region
     */
    populateLocationDropdown() {
        if (!this.locationDropdown || !this.currentRegion) return;

        // Clear existing options
        this.locationDropdown.innerHTML = '<option value="">Select a location...</option>';

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
        if (this.locationDropdown) {
            this.locationDropdown.addEventListener('change', (e) => {
                this.selectLocation(e.target.value);
            });
        }
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
            // Structured land-zone forecast straight from api.weather.gov
            // (CORS-enabled). Returns proper day/night periods; flatten them to
            // text for the existing <pre> renderer.
            const res = await window.BoatSafe.http.get(
                `https://api.weather.gov/zones/forecast/${encodeURIComponent(zoneId)}/forecast`,
                { cacheTTL: 30 });
            const json = typeof res === 'string' ? JSON.parse(res) : res;
            const props = json.properties || {};
            const periods = props.periods || [];
            if (!periods.length) throw new Error('No forecast periods available');

            const text = periods
                .map(p => `${p.name}\n${p.detailedForecast}`)
                .join('\n\n');

            this.currentData = {
                properties: {
                    updated: props.updated || new Date().toISOString(),
                    periods: [{ name: 'Coastal Forecast', detailedForecast: text }]
                }
            };
            this.renderZoneForecast(zoneId);

            try {
                localStorage.setItem('boatsafe_coastal_location', zoneId);
            } catch (error) {
                console.warn('Failed to save location preference:', error);
            }
        } catch (error) {
            console.error('Failed to load coastal forecast:', error);
            this.showError(`Failed to load coastal forecast for ${zoneId}: ${error.message}`);
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
                    <a href="https://forecast.weather.gov/MapClick.php?zoneid=${zoneId}" target="_blank" rel="noopener" class="noaa-link">View NOAA Dataset →</a>
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