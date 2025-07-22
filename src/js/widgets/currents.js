/**
 * Currents Widget - Current Information
 */
class Currents {
    constructor() {
        this.container = document.getElementById('currents');
        this.content = this.container.querySelector('.currents-content');
        this.dropdown = document.getElementById('current-station-dropdown');
        this.dataContainer = this.container.querySelector('.current-data-container');
        this.currentData = null;
        this.currentStations = null;
        this.currentDate = new Date();
        this.currentStationId = null;
        
        this.init();
    }

    /**
     * Initialize the widget
     */
    async init() {
        await this.loadCurrentStations();
        this.populateDropdown();
        this.setupEventListeners();
        this.renderDateNavigation();
    }

    /**
     * Load current stations data
     */
    async loadCurrentStations() {
        try {
            // Load current stations data from JSON file
            const response = await window.BoatSafe.http.get('./data/current-stations.json', { cacheTTL: 1440 });
            const stationsData = typeof response === 'string' ? JSON.parse(response) : response;
            
            // Extract stations from the data structure
            this.currentStations = stationsData.stations || {};
            
            console.log(`Loaded ${Object.keys(this.currentStations).length} Alaska current stations`);
        } catch (error) {
            console.error('Failed to load current stations:', error);
            // Fallback to minimal set of verified Alaska current stations
            this.currentStations = {
                'ACT6146': 'Clarence Strait, AK',
                'ACT6151': 'Stephens Passage, AK',
                'ACT6276': 'Wrangell Narrows, AK',
                'ACT5506': 'Port Wells, AK',
                'ACT5511': 'Valdez Arm, AK',
                'ACT4831': 'Knik Arm, AK',
                'ACT4841': 'Turnagain Arm, AK',
                'ACT4856': 'Kachemak Bay, AK'
            };
        }
    }

    /**
     * Populate dropdown with current stations
     */
    populateDropdown() {
        if (!this.dropdown || !this.currentStations) return;

        const stations = Object.entries(this.currentStations);
        stations.sort((a, b) => a[1].localeCompare(b[1]));

        stations.forEach(([id, name]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = name;
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
                    this.loadCurrentData(stationId, this.currentDate);
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
     * Load current data for selected station
     */
    async loadCurrentData(stationId, date = new Date()) {
        if (!this.currentStations[stationId]) return;

        this.showLoading();
        
        try {
            const dateStr = this.formatDateForAPI(date);
            const url = `/.netlify/functions/current-data/${stationId}?date=${dateStr}`;
            
            const response = await window.BoatSafe.http.get(url, { cacheTTL: 30 });
            this.currentData = response.data;
            this.render(stationId, date);
        } catch (error) {
            console.error('Failed to load current data:', error);
            this.showError('Current data not available. Please try again later.');
        }
    }

    /**
     * Show default message
     */
    showDefault() {
        this.dataContainer.innerHTML = '<div class="loading">Select a current station to view data</div>';
    }

    /**
     * Update widget with current data
     * @param {Object} data - Current data
     */
    update(data) {
        this.currentData = data;
        this.render();
    }

    /**
     * Render the currents
     */
    render(stationId = null, date = new Date()) {
        if (!this.currentData) {
            this.showError('No current data available');
            return;
        }

        // Handle different possible property names from NOAA API
        const predictions = this.currentData.current_predictions || 
                           this.currentData.predictions || 
                           this.currentData.currents_predictions ||
                           [];

        if (predictions.length === 0) {
            this.showError('No current predictions found for this date');
            return;
        }

        const currentEvents = this.processCurrentData(predictions);
        
        if (currentEvents.length === 0) {
            this.showError('No current events found for this date');
            return;
        }

        const stationName = stationId ? this.currentStations[stationId] : 'Unknown Station';
        const dateStr = this.formatDateDisplay(date);

        const html = `
            <div class="current-station">
                <div class="current-station-header">
                    <div class="current-station-name">${stationName}</div>
                    <div class="current-date">${dateStr}</div>
                </div>
                <div class="current-events">
                    ${currentEvents.map(event => this.renderCurrentEvent(event)).join('')}
                </div>
            </div>
        `;

        this.dataContainer.innerHTML = html;
    }

    /**
     * Process raw current data to extract max/slack events
     * @param {Array} predictions - Raw current predictions
     * @returns {Array} Processed current events
     */
    processCurrentData(predictions) {
        if (!predictions || predictions.length === 0) return [];
        
        const events = [];
        
        // NOAA API with 'currents_predictions' returns max flood/ebb and slack times
        predictions.forEach((prediction) => {
            // Handle different possible property formats
            const time = new Date(prediction.Time || prediction.t);
            const velocity = prediction.Velocity_Major ? parseFloat(prediction.Velocity_Major) : 
                           prediction.v ? parseFloat(prediction.v) : 0;
            const type = (prediction.Type || prediction.type || 'unknown').toLowerCase();
            
            events.push({
                time,
                velocity,
                type
            });
        });
        
        // Sort by time
        events.sort((a, b) => a.time - b.time);
        
        return events;
    }

    /**
     * Render individual current event
     * @param {Object} event - Current event
     * @returns {string} HTML string
     */
    renderCurrentEvent(event) {
        const { time, velocity, type } = event;
        
        // Map event types to display names
        const typeDisplay = type === 'flood' ? 'Max Flood' : 
                           type === 'ebb' ? 'Max Ebb' : 
                           type === 'slack' ? 'Slack' : 
                           type === 'max flood' ? 'Max Flood' :
                           type === 'max ebb' ? 'Max Ebb' :
                           'Current';
        
        const velocityDisplay = velocity > 0 ? `${velocity.toFixed(1)} kt` : 'Slack';
        
        return `
            <div class="current-event ${type}">
                <div class="current-type">${typeDisplay}</div>
                <div class="current-time">${this.formatTime(time)}</div>
                <div class="current-velocity">${velocityDisplay}</div>
            </div>
        `;
    }

    /**
     * Get station name (placeholder)
     * @returns {string} Station name
     */
    getStationName() {
        // In production, this would be derived from the station ID
        return 'Current Station';
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
            this.loadCurrentData(this.currentStationId, this.currentDate);
        }
    }

    /**
     * Render date navigation controls
     */
    renderDateNavigation() {
        const navigationHtml = `
            <div class="current-date-navigation">
                <button class="prev-day" title="Previous day">◀</button>
                <span class="current-date">${this.formatDateDisplay(this.currentDate)}</span>
                <button class="next-day" title="Next day">▶</button>
            </div>
        `;
        
        // Insert navigation above the data container
        const existingNav = this.container.querySelector('.current-date-navigation');
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
        this.dataContainer.innerHTML = '<div class="loading">Loading current data...</div>';
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
     * Get next current event
     * @returns {Object|null} Next current event
     */
    getNextCurrent() {
        if (!this.currentData) return null;
        
        // Handle different possible property names from NOAA API
        const predictions = this.currentData.current_predictions || 
                           this.currentData.predictions || 
                           this.currentData.currents_predictions ||
                           [];
        
        const events = this.processCurrentData(predictions);
        return events.length > 0 ? events[0] : null;
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Currents = Currents;
}