/**
 * SEAK Observations Widget
 * Southeast Alaska Marine Observations from NOAA
 */
class SEAKObservations {
    constructor() {
        this.container = document.getElementById('observations');
        this.content = this.container.querySelector('.observations-content');
        this.stationDropdown = document.getElementById('station-dropdown');
        this.observationsDisplay = this.container.querySelector('.observations-display');
        this.currentData = null;
        this.selectedStation = null;
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
     * Load stations data and populate station dropdown
     */
    async loadStations() {
        try {
            const response = await window.BoatSafe.http.get('./data/seak-stations.json', { cacheTTL: 1440 });
            this.stations = typeof response === 'string' ? JSON.parse(response) : response;
            this.populateStationDropdown();
            
            // Restore saved station if available
            try {
                const savedStation = localStorage.getItem('boatsafe_selected_seak_station');
                if (savedStation && this.stations.stations[savedStation]) {
                    this.stationDropdown.value = savedStation;
                    this.selectStation(savedStation);
                }
            } catch (error) {
                console.warn('Failed to restore station preference:', error);
            }
        } catch (error) {
            console.error('Failed to load stations:', error);
        }
    }

    /**
     * Populate station dropdown
     */
    populateStationDropdown() {
        if (!this.stationDropdown || !this.stations?.stations) return;

        this.stationDropdown.innerHTML = '<option value="">Select a station...</option>';
        
        Object.entries(this.stations.stations).forEach(([stationId, stationName]) => {
            const option = document.createElement('option');
            option.value = stationId;
            option.textContent = `${stationId} - ${stationName}`;
            this.stationDropdown.appendChild(option);
        });
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        if (this.stationDropdown) {
            this.stationDropdown.addEventListener('change', (e) => {
                const stationId = e.target.value;
                this.selectStation(stationId);
            });
        }
    }

    /**
     * Select and display specific station observations
     * @param {string} stationId - Station ID to display
     */
    async selectStation(stationId) {
        if (!stationId) {
            this.showLoading('Select a station to view observations');
            return;
        }

        this.selectedStation = stationId;
        this.showLoading('Loading observations...');
        
        try {
            // Load observation data for the selected station
            const currentHost = window.location.origin;
            const isLocal = currentHost.includes('localhost') || currentHost.includes('127.0.0.1');
            
            if (isLocal) {
                // Local development - show placeholder
                this.showLocalDevPlaceholder(stationId);
            } else {
                // Production - fetch real data via Netlify function
                const proxyUrl = `${currentHost}/.netlify/functions/seak-observations`;
                console.log('Fetching SEAK observations from:', proxyUrl);
                
                const data = await window.BoatSafe.http.get(proxyUrl, { cacheTTL: 10 });
                const response = typeof data === 'string' ? JSON.parse(data) : data;
                
                if (response && response.status === 'success' && response.observations) {
                    // Find the specific station data
                    const stationData = response.observations.find(obs => 
                        obs.stationId === stationId || obs.stationName === stationId
                    );
                    
                    if (stationData) {
                        this.renderStationObservations(stationData, response.timestamp);
                    } else {
                        this.showError(`No data available for station ${stationId}`);
                    }
                } else {
                    this.showError('Failed to load observation data');
                }
            }
            
            // Save station preference
            try {
                localStorage.setItem('boatsafe_selected_seak_station', stationId);
            } catch (error) {
                console.warn('Failed to save station preference:', error);
            }
        } catch (error) {
            console.error('Failed to load station observations:', error);
            this.showError(`Failed to load observations: ${error.message}`);
        }
    }

    /**
     * Render station observations data
     * @param {Object} stationData - Station observation data
     * @param {string} timestamp - Data timestamp
     */
    renderStationObservations(stationData, timestamp) {
        const stationName = this.stations.stations[stationData.stationId] || stationData.stationName || stationData.stationId;
        
        let observationLines = [];
        
        // Create observation lines for available data
        Object.entries(stationData).forEach(([key, value]) => {
            if (key !== 'stationId' && key !== 'stationName' && value && typeof value === 'object') {
                const displayValue = typeof value.value === 'number' ? 
                    value.value.toFixed(1) : value.value;
                observationLines.push(`<div class="observation-line"><strong>${key}:</strong> ${displayValue}${value.unit ? ' ' + value.unit : ''}</div>`);
            }
        });
        
        const html = `
            <div class="forecast-period">
                <div class="period-header">
                    <strong>${stationName}</strong>
                    <span class="period-time">${this.formatDate(timestamp)}</span>
                </div>
                <div class="forecast-text observation-data">
                    ${observationLines.length > 0 ? observationLines.join('') : '<div class="observation-line">No observation data available</div>'}
                </div>
                <div class="station-link">
                    <a href="https://www.weather.gov/ajk/MarineObservations" target="_blank" rel="noopener">
                        View All SEAK Marine Observations →
                    </a>
                </div>
            </div>
        `;
        
        if (this.observationsDisplay) {
            this.observationsDisplay.innerHTML = html;
        }
    }

    /**
     * Show local development placeholder
     */
    showLocalDevPlaceholder(stationId) {
        const stationName = this.stations.stations[stationId] || stationId;
        
        const html = `
            <div class="forecast-period">
                <div class="period-header">
                    <strong>${stationName}</strong>
                    <span class="period-time">Local Development Mode</span>
                </div>
                <div class="forecast-text observation-data">
                    <div class="observation-line"><strong>Temperature:</strong> 45.2°F</div>
                    <div class="observation-line"><strong>Wind Speed:</strong> 8.5 mph</div>
                    <div class="observation-line"><strong>Wind Direction:</strong> 240° SW</div>
                    <div class="observation-line"><strong>Relative Humidity:</strong> 78%</div>
                    <div class="observation-line">Deploy to Netlify to see real observation data</div>
                </div>
                <div class="station-link">
                    <a href="https://www.weather.gov/ajk/MarineObservations" target="_blank" rel="noopener">
                        View All SEAK Marine Observations →
                    </a>
                </div>
            </div>
        `;
        
        if (this.observationsDisplay) {
            this.observationsDisplay.innerHTML = html;
        }
    }

    /**
     * Show loading state
     * @param {string} message - Loading message
     */
    showLoading(message = 'Loading...') {
        if (this.observationsDisplay) {
            this.observationsDisplay.innerHTML = `<div class="loading">${message}</div>`;
        }
    }

    /**
     * Show error state
     * @param {string} message - Error message
     */
    showError(message) {
        if (this.observationsDisplay) {
            this.observationsDisplay.innerHTML = `
                <div class="status-message status-error">
                    <strong>Error:</strong> ${message}
                </div>
            `;
        }
    }

    /**
     * Format date for display
     * @param {string} dateString - Date string to format
     * @returns {string} Formatted date
     */
    formatDate(dateString) {
        if (!dateString) return 'Unknown';
        
        try {
            return new Date(dateString).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return dateString;
        }
    }

    /**
     * Clear widget content
     */
    clear() {
        this.selectedStation = null;
        this.showLoading('Select a station to view observations');
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.SEAKObservations = SEAKObservations;
}