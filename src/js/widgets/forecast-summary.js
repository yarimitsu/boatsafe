/**
 * Forecast Summary Widget
 */
class ForecastSummary {
    constructor() {
        this.container = document.getElementById('forecast-summary');
        this.content = this.container.querySelector('.forecast-content');
        this.toggleButton = document.getElementById('forecast-toggle');
        this.regionDropdown = document.getElementById('region-dropdown');
        this.zoneDropdown = document.getElementById('zone-dropdown');
        this.forecastDisplay = this.container.querySelector('.forecast-display');
        this.currentData = null;
        this.currentRegion = null;
        this.selectedZone = null;
        this.zones = null;
        this.isExpanded = true; // Default to expanded
        
        this.init();
    }

    /**
     * Initialize the widget
     */
    init() {
        this.setupToggleButton();
        this.showLoading();
        this.setupEventListeners();
        this.loadZones();
    }

    /**
     * Setup toggle button functionality
     */
    setupToggleButton() {
        if (!this.toggleButton) return;
        
        this.toggleButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleWidget();
        });
    }

    /**
     * Toggle widget visibility
     */
    toggleWidget() {
        if (this.isExpanded) {
            this.collapseWidget();
        } else {
            this.expandWidget();
        }
    }

    /**
     * Expand widget content
     */
    expandWidget() {
        this.content.style.display = 'block';
        this.content.classList.add('expanding');
        this.isExpanded = true;
        
        this.toggleButton.setAttribute('aria-expanded', 'true');
        this.toggleButton.querySelector('.chevron-icon').classList.add('expanded');
        
        setTimeout(() => {
            this.content.classList.remove('expanding');
        }, 300);
    }

    /**
     * Collapse widget content
     */
    collapseWidget() {
        this.content.classList.add('collapsing');
        this.isExpanded = false;
        
        this.toggleButton.setAttribute('aria-expanded', 'false');
        this.toggleButton.querySelector('.chevron-icon').classList.remove('expanded');
        
        setTimeout(() => {
            this.content.style.display = 'none';
            this.content.classList.remove('collapsing');
        }, 300);
    }

    /**
     * Load zones data and populate region dropdown
     */
    async loadZones() {
        try {
            const response = await window.BoatSafe.http.get('./data/zones.json', { skipCache: true, cacheTTL: 0 });
            this.zones = typeof response === 'string' ? JSON.parse(response) : response;
            this.populateRegionDropdown();
        } catch (error) {
            console.error('Failed to load zones:', error);
        }
    }

    /**
     * Populate region dropdown
     */
    populateRegionDropdown() {
        if (!this.regionDropdown || !this.zones?.regions) return;

        this.regionDropdown.innerHTML = '<option value="">Select a region...</option>';
        
        Object.entries(this.zones.regions).forEach(([id, region]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = region.name;
            this.regionDropdown.appendChild(option);
        });
        
        // Restore saved region if available
        try {
            const savedRegion = localStorage.getItem('boatsafe_selected_region');
            if (savedRegion && this.zones.regions[savedRegion]) {
                this.regionDropdown.value = savedRegion;
                this.selectRegion(savedRegion);
                
                // Also restore saved zone if available
                setTimeout(() => {
                    const savedZone = localStorage.getItem('boatsafe_selected_zone');
                    if (savedZone && this.currentRegion?.zones[savedZone]) {
                        this.zoneDropdown.value = savedZone;
                        this.selectZone(savedZone);
                    }
                }, 100);
            }
        } catch (error) {
            console.warn('Failed to restore preferences:', error);
        }
    }

    /**
     * Select a region and populate zone dropdown
     * @param {string} regionId - Region ID
     */
    selectRegion(regionId) {
        if (!regionId || !this.zones?.regions[regionId]) {
            this.zoneDropdown.innerHTML = '<option value="">Select a region first...</option>';
            return;
        }

        this.currentRegion = this.zones.regions[regionId];
        this.populateZoneDropdown();
        
        // Save region preference
        try {
            localStorage.setItem('boatsafe_selected_region', regionId);
        } catch (error) {
            console.warn('Failed to save region preference:', error);
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
        
        if (this.zoneDropdown) {
            this.zoneDropdown.addEventListener('change', (e) => {
                const zoneId = e.target.value;
                this.selectZone(zoneId);
            });
        }
    }

    /**
     * Update widget with region and forecast data
     * @param {Object} regionData - Region data with zones
     * @param {Object} forecastData - Complete forecast data
     */
    updateRegion(regionData, forecastData) {
        this.currentRegion = regionData;
        this.currentData = forecastData;
        this.populateZoneDropdown();
        this.showLoading('Select a specific zone to view forecast');
    }

    /**
     * Populate zone dropdown for current region
     */
    populateZoneDropdown() {
        if (!this.zoneDropdown || !this.currentRegion) return;

        // Clear existing options
        this.zoneDropdown.innerHTML = '<option value="">Select a zone...</option>';

        // Add zones for current region
        Object.entries(this.currentRegion.zones).forEach(([zoneId, zoneName]) => {
            const option = document.createElement('option');
            option.value = zoneId;
            option.textContent = `${zoneId} - ${zoneName}`;
            this.zoneDropdown.appendChild(option);
        });
    }

    /**
     * Select and display specific zone forecast
     * @param {string} zoneId - Zone ID to display
     */
    async selectZone(zoneId) {
        if (!zoneId || !this.currentRegion) {
            this.showLoading('Select a zone to view forecast');
            return;
        }

        this.selectedZone = zoneId;
        this.showLoading(`Loading forecast for ${zoneId}...`);

        try {
            // The Coastal Waters Forecast (CWF) text comes straight from
            // api.weather.gov (CORS-enabled). One product covers a group of
            // zones; extractZoneForecast() slices out this zone's section.
            const loc = ForecastSummary.cwfLocation(zoneId);
            if (!loc) throw new Error(`No CWF product mapped for zone ${zoneId}`);
            const { text, issuanceTime } = await ForecastSummary.fetchCwfText(loc);

            this.currentData = {
                properties: {
                    updated: issuanceTime || new Date().toISOString(),
                    periods: [{ name: 'Marine Forecast', detailedForecast: text }]
                }
            };
            this.renderZoneForecast(zoneId);

            try {
                localStorage.setItem('boatsafe_selected_zone', zoneId);
            } catch (error) {
                console.warn('Failed to save zone preference:', error);
            }
        } catch (error) {
            console.error('Failed to load zone forecast:', error);
            this.showError(`Failed to load forecast for ${zoneId}: ${error.message}`);
        }
    }

    // Which CWF product (by api.weather.gov location code) carries each marine
    // zone. Derived from the NOAA product filenames (…cwf.ajk/aeg/yak/aer/alu).
    static CWF_ZONES = {
        AJK: ['PKZ098', 'PKZ011', 'PKZ012', 'PKZ013', 'PKZ021', 'PKZ022', 'PKZ031', 'PKZ032', 'PKZ033', 'PKZ034', 'PKZ035', 'PKZ036'],
        AEG: ['PKZ641', 'PKZ661', 'PKZ642', 'PKZ662', 'PKZ643', 'PKZ663', 'PKZ644', 'PKZ664', 'PKZ651', 'PKZ671', 'PKZ652', 'PKZ672'],
        YAK: ['PKZ053'],
        AER: ['PKZ197', 'PKZ710', 'PKZ711', 'PKZ712', 'PKZ715', 'PKZ716', 'PKZ714', 'PKZ724', 'PKZ725', 'PKZ726', 'PKZ720', 'PKZ721', 'PKZ722', 'PKZ723', 'PKZ730', 'PKZ731', 'PKZ733', 'PKZ732', 'PKZ734', 'PKZ736', 'PKZ737', 'PKZ738', 'PKZ742', 'PKZ740', 'PKZ741'],
        ALU: ['PKZ750', 'PKZ751', 'PKZ752', 'PKZ753', 'PKZ754', 'PKZ755', 'PKZ756', 'PKZ757', 'PKZ758', 'PKZ759', 'PKZ770', 'PKZ772', 'PKZ771', 'PKZ773', 'PKZ774', 'PKZ775', 'PKZ776', 'PKZ777', 'PKZ778', 'PKZ780', 'PKZ781', 'PKZ782']
    };

    static cwfLocation(zoneId) {
        const z = zoneId.toUpperCase();
        if (!ForecastSummary._cwfIndex) {
            ForecastSummary._cwfIndex = {};
            for (const [loc, zones] of Object.entries(ForecastSummary.CWF_ZONES)) {
                for (const zz of zones) ForecastSummary._cwfIndex[zz] = loc;
            }
        }
        return ForecastSummary._cwfIndex[z] || null;
    }

    // Fetch the latest CWF product text for a location: list products, then
    // fetch the newest one's text. (api.weather.gov ld+json isn't auto-parsed.)
    static async fetchCwfText(loc) {
        const parse = r => (typeof r === 'string' ? JSON.parse(r) : r);
        const list = parse(await window.BoatSafe.http.get(
            `https://api.weather.gov/products/types/CWF/locations/${loc}`, { cacheTTL: 30 }));
        const graph = (list && (list['@graph'] || list.features)) || [];
        if (!graph.length) throw new Error(`No CWF product available for ${loc}`);
        const id = graph[0].id || graph[0]['@id'];
        const product = parse(await window.BoatSafe.http.get(
            `https://api.weather.gov/products/${id}`, { cacheTTL: 30 }));
        return { text: product.productText || '', issuanceTime: product.issuanceTime };
    }

    /**
     * Update widget with forecast data (legacy method)
     * @param {Object} data - Parsed forecast data
     */
    update(data) {
        this.currentData = data;
        this.render();
    }

    /**
     * Render the forecast
     */
    render() {
        if (!this.currentData) {
            this.showLoading();
            return;
        }

        const { zoneName, issued, periods } = this.currentData;
        
        if (!periods || periods.length === 0) {
            this.showError('No forecast periods available');
            return;
        }

        // Get station name and issue time from first period
        const firstPeriod = periods[0];
        const stationName = firstPeriod.stationName || zoneName;
        const issueTime = firstPeriod.issueTime || this.formatDate(issued);

        const html = `
            <div class="forecast-header">
                <div class="forecast-location">${stationName}</div>
                <div class="forecast-updated">${issueTime}</div>
                <div class="forecast-link">
                    <a href="https://www.weather.gov/marine/forecast#akcwf" target="_blank" rel="noopener">
                        View All Alaska Marine Forecasts →
                    </a>
                </div>
            </div>
            <div class="forecast-periods">
                ${periods.map(period => this.renderPeriod(period)).join('')}
            </div>
        `;

        this.content.innerHTML = html;
    }

    /**
     * Render individual forecast period
     * @param {Object} period - Period data
     * @returns {string} HTML string
     */
    renderPeriod(period) {
        const { name, text } = period;
        
        return `
            <div class="forecast-period">
                <div class="period-name">${name}</div>
                <div class="period-text">${text}</div>
            </div>
        `;
    }

    /**
     * Render wind information
     * @param {Object} wind - Wind data
     * @returns {string} HTML string
     */
    renderWind(wind) {
        return `
            <div class="wind-info">
                <div class="wind-direction">${wind.directionName}</div>
                <div class="wind-speed">${wind.speed}${wind.maxSpeed ? '-' + wind.maxSpeed : ''} kt</div>
                <div class="wind-description">${wind.description}</div>
            </div>
        `;
    }

    /**
     * Render wave information
     * @param {Object} waves - Wave data
     * @returns {string} HTML string
     */
    renderWaves(waves) {
        return `
            <div class="wave-info">
                <div class="wave-height">${waves.height}${waves.maxHeight ? '-' + waves.maxHeight : ''} ft</div>
                <div class="wave-period">${waves.description}</div>
            </div>
        `;
    }

    /**
     * Render weather information
     * @param {Object} weather - Weather data
     * @returns {string} HTML string
     */
    renderWeather(weather) {
        return `
            <div class="weather-info">
                <div class="weather-conditions">${weather.conditions.join(', ')}</div>
                <div class="weather-description">${weather.description}</div>
            </div>
        `;
    }

    /**
     * Get display time for period
     * @param {string} periodName - Period name
     * @returns {string} Time string
     */
    getPeriodTime(periodName) {
        const now = new Date();
        const timeMap = {
            'TODAY': 'Today',
            'TONIGHT': 'Tonight',
            'TOMORROW': 'Tomorrow',
            'FRIDAY': 'Friday',
            'SATURDAY': 'Saturday',
            'SUNDAY': 'Sunday',
            'MONDAY': 'Monday',
            'TUESDAY': 'Tuesday',
            'WEDNESDAY': 'Wednesday',
            'THURSDAY': 'Thursday'
        };
        
        return timeMap[periodName] || periodName;
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
     * Render forecast for specific zone (optimized for low bandwidth)
     * @param {string} zoneId - Zone ID to render
     */
    renderZoneForecast(zoneId) {
        if (!this.currentData || !this.currentData.properties || !this.currentData.properties.periods) {
            this.showError('No forecast data available');
            return;
        }

        const fullText = this.currentData.properties.periods[0].detailedForecast;
        const zoneForecast = this.extractZoneForecast(fullText, zoneId);
        
        if (!zoneForecast) {
            this.showError(`Forecast for ${zoneId} not found in current data`);
            return;
        }

        const zoneName = this.currentRegion?.zones[zoneId] || zoneId;
        
        // Streamlined for low bandwidth - minimal HTML
        const html = `
            <div class="forecast-header">
                <strong>${zoneId} - ${zoneName}</strong>
                <div class="forecast-meta">
                    <small>NOAA Update: ${this.formatDate(new Date(this.currentData.properties.updated))}</small>
                    <a href="https://www.weather.gov/marine/forecast#akcwf" target="_blank" rel="noopener" class="noaa-link">View NOAA Dataset →</a>
                </div>
            </div>
            <div class="zone-forecast">
                <pre class="forecast-text">${zoneForecast}</pre>
            </div>
        `;

        if (this.forecastDisplay) {
            this.forecastDisplay.innerHTML = html;
        } else {
            this.content.innerHTML = html;
        }
    }

    /**
     * Extract forecast text for specific zone
     * @param {string} fullText - Complete forecast text
     * @param {string} zoneId - Zone ID to extract
     * @returns {string|null} Zone-specific forecast text
     */
    extractZoneForecast(fullText, zoneId) {
        const lines = fullText.split('\n');
        let zoneStartIndex = -1;
        let zoneEndIndex = -1;
        
        // Find the start of the zone section
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(zoneId)) {
                zoneStartIndex = i;
                break;
            }
        }
        
        if (zoneStartIndex === -1) {
            return null;
        }
        
        // Find the end of the zone section (next PKZ or end of text)
        for (let i = zoneStartIndex + 1; i < lines.length; i++) {
            if (lines[i].match(/PKZ\d{3}/)) {
                zoneEndIndex = i;
                break;
            }
        }
        
        if (zoneEndIndex === -1) {
            zoneEndIndex = lines.length;
        }
        
        return lines.slice(zoneStartIndex, zoneEndIndex).join('\n').trim();
    }

    /**
     * Show loading state
     */
    showLoading(message = 'Loading forecast...') {
        const content = this.forecastDisplay || this.content;
        content.innerHTML = `<div class="loading">${message}</div>`;
    }

    /**
     * Show error state
     * @param {string} message - Error message
     */
    showError(message) {
        this.content.innerHTML = `
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
        this.content.innerHTML = '<div class="loading">Select a zone to view forecast</div>';
    }

    /**
     * Get current forecast data
     * @returns {Object|null} Current forecast data
     */
    getData() {
        return this.currentData;
    }

    /**
     * Export forecast data as text
     * @returns {string} Text representation
     */
    exportAsText() {
        if (!this.currentData) return '';
        
        const { zoneName, issued, periods } = this.currentData;
        
        let text = `Marine Forecast for ${zoneName}\n`;
        text += `Updated: ${this.formatDate(issued)}\n\n`;
        
        periods.forEach(period => {
            text += `${period.name}:\n`;
            text += `${period.summary}\n\n`;
        });
        
        return text;
    }

    /**
     * Check if forecast is current
     * @returns {boolean} Whether forecast is current
     */
    isCurrent() {
        if (!this.currentData || !this.currentData.issued) return false;
        
        const now = new Date();
        const issued = new Date(this.currentData.issued);
        const diffHours = (now - issued) / (1000 * 60 * 60);
        
        return diffHours < 12; // Consider current if less than 12 hours old
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.ForecastSummary = ForecastSummary;
}