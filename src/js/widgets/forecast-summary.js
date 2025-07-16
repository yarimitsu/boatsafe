/**
 * Forecast Summary Widget
 */
class ForecastSummary {
    constructor() {
        this.container = document.getElementById('forecast-summary');
        this.content = this.container.querySelector('.forecast-content');
        this.currentData = null;
        
        this.init();
    }

    /**
     * Initialize the widget
     */
    init() {
        this.showLoading();
    }

    /**
     * Update widget with forecast data
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

        const html = `
            <div class="forecast-header">
                <div class="forecast-location">${zoneName || 'Unknown Zone'}</div>
                <div class="forecast-updated">Updated: ${this.formatDate(issued)}</div>
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
        const { name, wind, waves, weather, summary } = period;
        
        return `
            <div class="forecast-period">
                <div class="period-header">
                    <div class="period-name">${name}</div>
                    <div class="period-time">${this.getPeriodTime(name)}</div>
                </div>
                
                ${wind ? this.renderWind(wind) : ''}
                ${waves ? this.renderWaves(waves) : ''}
                ${weather ? this.renderWeather(weather) : ''}
                
                <div class="weather-summary">${summary}</div>
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
     * Show loading state
     */
    showLoading() {
        this.content.innerHTML = '<div class="loading">Loading forecast...</div>';
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