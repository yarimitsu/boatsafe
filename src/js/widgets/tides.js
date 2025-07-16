/**
 * Tides Widget - Tide Information
 */
class Tides {
    constructor() {
        this.container = document.getElementById('tides');
        this.content = this.container.querySelector('.tides-content');
        this.dropdown = document.getElementById('tide-station-dropdown');
        this.dataContainer = this.container.querySelector('.tide-data-container');
        this.currentData = null;
        this.tideStations = null;
        
        this.init();
    }

    /**
     * Initialize the widget
     */
    async init() {
        await this.loadTideStations();
        this.populateDropdown();
        this.setupEventListeners();
    }

    /**
     * Load tide stations data
     */
    async loadTideStations() {
        try {
            const response = await window.BightWatch.http.get('./data/tide-stations.json', { cacheTTL: 1440 });
            this.tideStations = typeof response === 'string' ? JSON.parse(response) : response;
        } catch (error) {
            console.error('Failed to load tide stations:', error);
            this.tideStations = {};
        }
    }

    /**
     * Populate dropdown with tide stations
     */
    populateDropdown() {
        if (!this.dropdown || !this.tideStations) return;

        const stations = Object.entries(this.tideStations);
        stations.sort((a, b) => a[1].name.localeCompare(b[1].name));

        stations.forEach(([id, station]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = station.name;
            this.dropdown.appendChild(option);
        });
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        if (this.dropdown) {
            this.dropdown.addEventListener('change', (e) => {
                const stationId = e.target.value;
                if (stationId) {
                    this.loadTideData(stationId);
                } else {
                    this.showDefault();
                }
            });
        }
    }

    /**
     * Load tide data for selected station
     */
    async loadTideData(stationId) {
        if (!this.tideStations[stationId]) return;

        this.showLoading();
        
        try {
            const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
            const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=${today}&end_date=${today}&station=${stationId}&product=predictions&datum=MLLW&time_zone=lst_ldt&units=english&format=json`;
            
            const data = await window.BightWatch.http.get(url, { cacheTTL: 1440 });
            this.currentData = data;
            this.render(stationId);
        } catch (error) {
            console.error('Failed to load tide data:', error);
            this.showError('Tide data not available');
        }
    }

    /**
     * Show default message
     */
    showDefault() {
        this.dataContainer.innerHTML = '<div class="loading">Select a tide station to view data</div>';
    }

    /**
     * Update widget with tide data
     * @param {Object} data - Tide data
     */
    update(data) {
        this.currentData = data;
        this.render();
    }

    /**
     * Render the tides
     */
    render(stationId = null) {
        if (!this.currentData || !this.currentData.predictions) {
            this.showError('No tide data available');
            return;
        }

        const tideEvents = this.processTideData(this.currentData.predictions);
        
        if (tideEvents.length === 0) {
            this.showError('No tide events found');
            return;
        }

        const stationName = stationId ? this.tideStations[stationId].name : 'Unknown Station';

        const html = `
            <div class="tide-station">
                <div class="tide-station-name">${stationName}</div>
                <div class="tide-events">
                    ${tideEvents.map(event => this.renderTideEvent(event)).join('')}
                </div>
            </div>
        `;

        this.dataContainer.innerHTML = html;
    }

    /**
     * Process raw tide data to extract high/low events
     * @param {Array} predictions - Raw tide predictions
     * @returns {Array} Processed tide events
     */
    processTideData(predictions) {
        if (!predictions || predictions.length === 0) return [];
        
        const events = [];
        const now = new Date();
        const nextDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        
        // This is a simplified approach - in production, you'd need more sophisticated tide analysis
        predictions.forEach((prediction, index) => {
            const time = new Date(prediction.t);
            const height = parseFloat(prediction.v);
            
            if (time >= now && time <= nextDay) {
                // Determine if high or low tide by comparing with neighbors
                const prev = predictions[index - 1];
                const next = predictions[index + 1];
                
                if (prev && next) {
                    const prevHeight = parseFloat(prev.v);
                    const nextHeight = parseFloat(next.v);
                    
                    const isHigh = height > prevHeight && height > nextHeight;
                    const isLow = height < prevHeight && height < nextHeight;
                    
                    if (isHigh || isLow) {
                        events.push({
                            time,
                            height,
                            type: isHigh ? 'high' : 'low'
                        });
                    }
                }
            }
        });
        
        return events.slice(0, 8); // Limit to next 8 events
    }

    /**
     * Render individual tide event
     * @param {Object} event - Tide event
     * @returns {string} HTML string
     */
    renderTideEvent(event) {
        const { time, height, type } = event;
        
        return `
            <div class="tide-event ${type}">
                <div class="tide-type">${type} tide</div>
                <div class="tide-time">${this.formatTime(time)}</div>
                <div class="tide-height">${height.toFixed(1)} ft</div>
            </div>
        `;
    }

    /**
     * Get station name (placeholder)
     * @returns {string} Station name
     */
    getStationName() {
        // In production, this would be derived from the station ID
        return 'Tide Station';
    }

    /**
     * Format time for display
     * @param {Date} date - Date object
     * @returns {string} Formatted time string
     */
    formatTime(date) {
        if (!date) return 'Unknown';
        
        try {
            return new Date(date).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
        } catch (error) {
            return 'Unknown';
        }
    }

    /**
     * Show loading state
     */
    showLoading() {
        this.dataContainer.innerHTML = '<div class="loading">Loading tide data...</div>';
    }

    /**
     * Show error state
     * @param {string} message - Error message
     */
    showError(message) {
        this.dataContainer.innerHTML = `
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
        this.showDefault();
    }

    /**
     * Get next tide event
     * @returns {Object|null} Next tide event
     */
    getNextTide() {
        if (!this.currentData || !this.currentData.predictions) return null;
        
        const events = this.processTideData(this.currentData.predictions);
        return events.length > 0 ? events[0] : null;
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Tides = Tides;
}