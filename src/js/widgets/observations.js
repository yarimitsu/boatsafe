/**
 * Observations Widget - Buoy Observations
 */
class Observations {
    constructor() {
        this.container = document.getElementById('observations');
        this.content = this.container.querySelector('.observations-content');
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
     * Update widget with observations data
     * @param {Array} data - Array of observation data
     */
    update(data) {
        this.currentData = data;
        this.render();
    }

    /**
     * Render the observations
     */
    render() {
        if (!this.currentData || this.currentData.length === 0) {
            this.showError('No observation data available');
            return;
        }

        const html = `
            <div class="observation-stations">
                ${this.currentData.map(station => this.renderStation(station)).join('')}
            </div>
        `;

        this.content.innerHTML = html;
    }

    /**
     * Render individual observation station
     * @param {string} rawData - Raw observation data
     * @returns {string} HTML string
     */
    renderStation(rawData) {
        const parsed = this.parseObservationData(rawData);
        
        if (!parsed) {
            return '<div class="status-message status-error">Failed to parse observation data</div>';
        }

        return `
            <div class="observation-station">
                <div class="station-header">
                    <div class="station-name">${parsed.stationName}</div>
                    <div class="station-time">${this.formatTime(parsed.time)}</div>
                </div>
                <div class="observation-data">
                    ${this.renderObservationItems(parsed.data)}
                </div>
            </div>
        `;
    }

    /**
     * Parse raw observation data
     * @param {string} rawData - Raw data string
     * @returns {Object|null} Parsed data
     */
    parseObservationData(rawData) {
        if (!rawData || typeof rawData !== 'string') return null;
        
        const lines = rawData.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) return null;
        
        // This is a simplified parser - in production, you'd need more robust NDBC parsing
        const headerLine = lines[0];
        const dataLine = lines[lines.length - 1]; // Get most recent data
        
        try {
            const stationMatch = headerLine.match(/Station\s+(\w+)/i);
            const stationName = stationMatch ? stationMatch[1] : 'Unknown Station';
            
            // Parse data fields (simplified)
            const fields = dataLine.split(/\s+/);
            
            return {
                stationName,
                time: new Date(),
                data: {
                    windSpeed: fields[6] || 'N/A',
                    windDirection: fields[5] || 'N/A',
                    waveHeight: fields[8] || 'N/A',
                    wavePeriod: fields[9] || 'N/A',
                    pressure: fields[12] || 'N/A',
                    temperature: fields[13] || 'N/A'
                }
            };
        } catch (error) {
            console.error('Failed to parse observation data:', error);
            return null;
        }
    }

    /**
     * Render observation data items
     * @param {Object} data - Observation data
     * @returns {string} HTML string
     */
    renderObservationItems(data) {
        const items = [
            { label: 'Wind Speed', value: data.windSpeed, unit: 'kt' },
            { label: 'Wind Dir', value: data.windDirection, unit: '°' },
            { label: 'Wave Height', value: data.waveHeight, unit: 'ft' },
            { label: 'Wave Period', value: data.wavePeriod, unit: 's' },
            { label: 'Pressure', value: data.pressure, unit: 'mb' },
            { label: 'Air Temp', value: data.temperature, unit: '°F' }
        ];
        
        return items.map(item => `
            <div class="observation-item">
                <div class="observation-label">${item.label}</div>
                <div class="observation-value">
                    ${item.value}
                    <span class="observation-unit">${item.unit}</span>
                </div>
            </div>
        `).join('');
    }

    /**
     * Format time for display
     * @param {Date} date - Date object
     * @returns {string} Formatted time string
     */
    formatTime(date) {
        if (!date) return 'Unknown';
        
        try {
            const now = new Date();
            const diffMinutes = Math.floor((now - date) / (1000 * 60));
            
            if (diffMinutes < 60) {
                return `${diffMinutes} min ago`;
            } else if (diffMinutes < 1440) {
                return `${Math.floor(diffMinutes / 60)} hr ago`;
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
        this.content.innerHTML = '<div class="loading">Loading observations...</div>';
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
        this.content.innerHTML = '<div class="loading">Loading observations...</div>';
    }

    /**
     * Get latest observation
     * @returns {Object|null} Latest observation data
     */
    getLatest() {
        if (!this.currentData || this.currentData.length === 0) return null;
        
        return this.parseObservationData(this.currentData[0]);
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Observations = Observations;
}