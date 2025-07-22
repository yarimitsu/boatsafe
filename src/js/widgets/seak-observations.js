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
                console.log('Received SEAK observations response:', response);
                
                if (response && response.status === 'success' && response.observations) {
                    // Find the specific station data - check both 'stn' and 'stationId' fields
                    const stationData = response.observations.find(obs => 
                        obs.stationId === stationId || 
                        obs.stn === stationId ||
                        obs.stationName === stationId
                    );
                    
                    if (stationData) {
                        console.log('Found station data for', stationId, ':', stationData);
                        this.renderStationObservations(stationData, response.timestamp);
                    } else {
                        console.warn('Station not found in observations data. Available stations:', response.observations.map(obs => obs.stn || obs.stationId));
                        this.showError(`No data available for station ${stationId}. Station may be offline or not reporting current observations.`);
                    }
                } else {
                    console.error('Invalid response format:', response);
                    this.showError('Failed to load observation data - invalid response format');
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
            
            // Provide more specific error messages based on error type
            let errorMessage = 'Failed to load observations';
            if (error.name === 'NetworkError' || error.message.includes('fetch')) {
                errorMessage = 'Network error - please check your internet connection';
            } else if (error.message.includes('timeout')) {
                errorMessage = 'Request timed out - NOAA servers may be busy';
            } else if (error.message.includes('JSON')) {
                errorMessage = 'Invalid data format received from weather service';
            } else {
                errorMessage = `Failed to load observations: ${error.message}`;
            }
            
            this.showError(errorMessage);
        }
    }

    /**
     * Render station observations data
     * @param {Object} stationData - Station observation data
     * @param {string} timestamp - Data timestamp
     */
    renderStationObservations(stationData, timestamp) {
        const stationId = stationData.stationId || stationData.stn;
        const stationName = this.stations.stations[stationId] || stationData.stationName || stationData.stnName || stationId;
        
        let observationLines = [];
        
        // Handle the NOAA data format - direct field mapping with appropriate units and labels
        const dataFields = {
            'temp': { label: 'Temperature', unit: '°F', format: (val) => parseFloat(val).toFixed(1) },
            'dewPt': { label: 'Dew Point', unit: '°F', format: (val) => parseFloat(val).toFixed(1) },
            'rh': { label: 'Relative Humidity', unit: '%', format: (val) => parseFloat(val).toFixed(1) },
            'windSpd': { label: 'Wind Speed', unit: ' mph', format: (val) => parseFloat(val).toFixed(1) },
            'windDir': { label: 'Wind Direction', unit: '', format: (val) => val },
            'windGust': { label: 'Wind Gust', unit: ' mph', format: (val) => parseFloat(val).toFixed(1) },
            'seaLevelPressure': { label: 'Sea Level Pressure', unit: ' mb', format: (val) => parseFloat(val).toFixed(1) },
            'altimeter': { label: 'Pressure', unit: ' inHg', format: (val) => parseFloat(val).toFixed(2) },
            'visibility': { label: 'Visibility', unit: ' mi', format: (val) => parseFloat(val).toFixed(1) },
            'ceiling': { label: 'Ceiling', unit: ' ft', format: (val) => parseFloat(val).toFixed(0) },
            'weather': { label: 'Weather Conditions', unit: '', format: (val) => val },
            'sky': { label: 'Sky Conditions', unit: '', format: (val) => val },
            'precip': { label: 'Precipitation', unit: ' in', format: (val) => parseFloat(val).toFixed(2) }
        };
        
        // Process each available data field
        Object.keys(dataFields).forEach(fieldKey => {
            const fieldInfo = dataFields[fieldKey];
            let value = stationData[fieldKey];
            
            // Handle both direct field access and the Netlify function's nested structure
            if (stationData[fieldInfo.label] && typeof stationData[fieldInfo.label] === 'object') {
                // Netlify function format: { value: x, unit: y }
                value = stationData[fieldInfo.label].value;
                const unit = stationData[fieldInfo.label].unit || fieldInfo.unit;
                
                if (value && value !== '-' && value !== '--' && value !== 'M' && value !== '') {
                    try {
                        let displayValue = fieldInfo.format(value);
                        if (!isNaN(parseFloat(displayValue)) || fieldKey === 'windDir' || fieldKey === 'weather' || fieldKey === 'sky') {
                            observationLines.push(
                                `<div class="observation-line"><strong>${fieldInfo.label}:</strong> ${displayValue}${unit}</div>`
                            );
                        }
                    } catch (error) {
                        console.debug(`Skipping invalid value for ${fieldInfo.label}:`, value);
                    }
                }
            } else if (value && value !== '-' && value !== '--' && value !== 'M' && value !== '') {
                // Direct field format (raw NOAA data)
                try {
                    let displayValue = fieldInfo.format(value);
                    if (!isNaN(parseFloat(displayValue)) || fieldKey === 'windDir' || fieldKey === 'weather' || fieldKey === 'sky') {
                        observationLines.push(
                            `<div class="observation-line"><strong>${fieldInfo.label}:</strong> ${displayValue}${fieldInfo.unit}</div>`
                        );
                    }
                } catch (error) {
                    console.debug(`Skipping invalid value for ${fieldKey}:`, value);
                }
            }
        });
        
        const html = `
            <div class="forecast-period">
                <div class="period-header">
                    <strong>${stationName}</strong>
                    <span class="period-time">${this.formatDate(timestamp)}</span>
                </div>
                <div class="forecast-text observation-data">
                    ${observationLines.length > 0 ? observationLines.join('') : '<div class="observation-line">No current observation data available for this station</div>'}
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
            // Handle NOAA timestamp format: "07/22/2025 08:00:33 Local"
            let date;
            if (dateString.includes('Local')) {
                // Parse NOAA format
                const dateOnly = dateString.replace(' Local', '');
                date = new Date(dateOnly);
            } else {
                date = new Date(dateString);
            }
            
            if (isNaN(date.getTime())) {
                return dateString; // Return original if parsing fails
            }
            
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            console.debug('Date parsing error:', error, 'for date string:', dateString);
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