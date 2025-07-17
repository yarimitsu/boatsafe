/**
 * Forecast Summary Widget
 */
class ForecastSummary {
    constructor() {
        this.container = document.getElementById('forecast-summary');
        this.content = this.container.querySelector('.forecast-content');
        this.zoneDropdown = document.getElementById('zone-dropdown');
        this.forecastDisplay = this.container.querySelector('.forecast-display');
        this.currentData = null;
        this.currentRegion = null;
        this.selectedZone = null;
        
        this.init();
    }

    /**
     * Initialize the widget
     */
    init() {
        this.showLoading();
        this.setupEventListeners();
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
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
    selectZone(zoneId) {
        if (!zoneId || !this.currentData) {
            this.showLoading('Select a zone to view forecast');
            return;
        }

        this.selectedZone = zoneId;
        this.renderZoneForecast(zoneId);
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
                    <a href="https://www.ndbc.noaa.gov/data/Forecasts/FZAK51.PAJK.html" target="_blank" rel="noopener">
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
     * Render forecast for specific zone
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
        
        const html = `
            <div class="forecast-header">
                <div class="forecast-location">${zoneId} - ${zoneName}</div>
                <div class="forecast-updated">Updated: ${this.formatDate(new Date(this.currentData.properties.updated))}</div>
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