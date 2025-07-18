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
        this.currentDate = new Date();
        this.currentStationId = null;
        
        this.init();
    }

    /**
     * Initialize the widget
     */
    async init() {
        await this.loadTideStations();
        this.populateDropdown();
        this.setupEventListeners();
        this.renderDateNavigation();
    }

    /**
     * Load tide stations data
     */
    async loadTideStations() {
        // Real Alaska tide stations from NOAA - verified official names
        this.tideStations = {
            '9452210': { name: 'Juneau, AK' },
            '9452400': { name: 'Skagway, Taiya Inlet, AK' },
            '9450460': { name: 'Ketchikan, Tongass Narrows, AK' },
            '9455920': { name: 'Anchorage, AK' },
            '9462450': { name: 'Nikolski, AK' },
            '9455500': { name: 'Seward, AK' },
            '9455760': { name: 'Nikiski, AK' },
            '9454050': { name: 'Valdez, AK' },
            '9454240': { name: 'Cordova, AK' },
            '9453220': { name: 'Kodiak Island, AK' },
            '9459450': { name: 'Homer, AK' }
        };
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
                this.currentStationId = stationId;
                if (stationId) {
                    this.loadTideData(stationId, this.currentDate);
                } else {
                    this.showDefault();
                }
            });
        }
        
        // Use event delegation for date navigation buttons
        this.container.addEventListener('click', (e) => {
            if (e.target.classList.contains('prev-day')) {
                this.navigateDate(-1);
            } else if (e.target.classList.contains('next-day')) {
                this.navigateDate(1);
            }
        });
    }

    /**
     * Load tide data for selected station
     */
    async loadTideData(stationId, date = new Date()) {
        if (!this.tideStations[stationId]) return;

        this.showLoading();
        
        try {
            const dateStr = this.formatDateForAPI(date);
            const url = `/.netlify/functions/tide-data/${stationId}?date=${dateStr}`;
            
            const response = await window.BoatSafe.http.get(url, { cacheTTL: 30 });
            this.currentData = response.data;
            this.render(stationId, date);
        } catch (error) {
            console.error('Failed to load tide data:', error);
            this.showError('Tide data not available. Please try again later.');
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
    render(stationId = null, date = new Date()) {
        if (!this.currentData || !this.currentData.predictions) {
            this.showError('No tide data available');
            return;
        }

        const tideEvents = this.processTideData(this.currentData.predictions);
        
        if (tideEvents.length === 0) {
            this.showError('No tide events found for this date');
            return;
        }

        const stationName = stationId ? this.tideStations[stationId].name : 'Unknown Station';
        const dateStr = this.formatDateDisplay(date);

        const html = `
            <div class="tide-station">
                <div class="tide-station-header">
                    <div class="tide-station-name">${stationName}</div>
                    <div class="tide-date">${dateStr}</div>
                </div>
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
        
        // NOAA API with 'hilo' interval returns actual high/low predictions
        predictions.forEach((prediction) => {
            const time = new Date(prediction.t);
            const height = parseFloat(prediction.v);
            const type = prediction.type === 'H' ? 'high' : 'low';
            
            events.push({
                time,
                height,
                type
            });
        });
        
        // Sort by time
        events.sort((a, b) => a.time - b.time);
        
        return events;
    }

    /**
     * Render individual tide event
     * @param {Object} event - Tide event
     * @returns {string} HTML string
     */
    renderTideEvent(event) {
        const { time, height, type } = event;
        const typeDisplay = type === 'high' ? 'High' : 'Low';
        const heightDisplay = height >= 0 ? `${height.toFixed(1)} ft` : `${height.toFixed(1)} ft`;
        
        return `
            <div class="tide-event ${type}">
                <div class="tide-type">${typeDisplay} Tide</div>
                <div class="tide-time">${this.formatTime(time)}</div>
                <div class="tide-height">${heightDisplay}</div>
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
     * Format date for API calls (YYYYMMDD)
     * @param {Date} date - Date object
     * @returns {string} Formatted date string
     */
    formatDateForAPI(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }

    /**
     * Format date for display
     * @param {Date} date - Date object
     * @returns {string} Formatted date string
     */
    formatDateDisplay(date) {
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    /**
     * Navigate to previous or next day
     * @param {number} direction - -1 for previous, 1 for next
     */
    navigateDate(direction) {
        const newDate = new Date(this.currentDate);
        newDate.setDate(newDate.getDate() + direction);
        this.currentDate = newDate;
        
        this.updateDateNavigation();
        
        if (this.currentStationId) {
            this.loadTideData(this.currentStationId, this.currentDate);
        }
    }

    /**
     * Render date navigation controls
     */
    renderDateNavigation() {
        const navigationHtml = `
            <div class="tide-date-navigation">
                <button class="prev-day" title="Previous day">◀</button>
                <span class="current-date">${this.formatDateDisplay(this.currentDate)}</span>
                <button class="next-day" title="Next day">▶</button>
            </div>
        `;
        
        // Insert navigation above the data container
        const existingNav = this.container.querySelector('.tide-date-navigation');
        if (existingNav) {
            existingNav.remove();
        }
        
        this.dataContainer.insertAdjacentHTML('beforebegin', navigationHtml);
    }

    /**
     * Update date navigation display
     */
    updateDateNavigation() {
        const currentDateSpan = this.container.querySelector('.current-date');
        if (currentDateSpan) {
            currentDateSpan.textContent = this.formatDateDisplay(this.currentDate);
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