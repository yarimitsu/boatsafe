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
        this.allStations = [];
        
        this.init();
    }

    /**
     * Initialize the widget
     */
    init() {
        this.showLoading();
        this.setupEventListeners();
        this.loadObservations();
    }

    /**
     * Load all SEAK observations data
     */
    async loadObservations() {
        try {
            const currentHost = window.location.origin;
            const isLocal = currentHost.includes('localhost') || currentHost.includes('127.0.0.1');
            
            let data;
            if (isLocal) {
                // Local development - show placeholder
                console.log('Local development mode - showing placeholder data');
                this.showLocalDevPlaceholder();
                return;
            } else {
                // Production - fetch real data via Netlify function
                const proxyUrl = `${currentHost}/.netlify/functions/seak-observations`;
                console.log('Fetching SEAK observations from:', proxyUrl);
                
                const response = await window.BoatSafe.http.get(proxyUrl, { cacheTTL: 10 });
                data = typeof response === 'string' ? JSON.parse(response) : response;
            }
            
            if (data && data.status === 'success' && data.observations && Array.isArray(data.observations)) {
                console.log(`Loaded ${data.observations.length} SEAK observation stations`);
                this.currentData = data;
                this.allStations = data.observations;
                this.populateStationDropdown();
                this.showLoading('Select a station to view observations');
                
                // Restore saved station if available
                try {
                    const savedStation = localStorage.getItem('boatsafe_selected_seak_station');
                    if (savedStation) {
                        const station = this.allStations.find(s => s.stationId === savedStation || s.stationName === savedStation);
                        if (station) {
                            this.stationDropdown.value = station.stationId || station.stationName;
                            this.selectStation(station.stationId || station.stationName);
                        }
                    }
                } catch (error) {
                    console.warn('Failed to restore station preference:', error);
                }
            } else {
                const errorMsg = data?.observations ? 
                    'No valid observation stations found' : 
                    'Invalid response format from NOAA data source';
                throw new Error(errorMsg);
            }
        } catch (error) {
            console.error('Failed to load SEAK observations:', error);
            this.showError(`Failed to load SEAK observations: ${error.message}`);
        }
    }

    /**
     * Populate station dropdown with available stations
     */
    populateStationDropdown() {
        if (!this.stationDropdown || !this.allStations) return;

        this.stationDropdown.innerHTML = '<option value="">Select a station...</option>';
        
        // Sort stations by name for better UX
        const sortedStations = [...this.allStations].sort((a, b) => {
            const nameA = a.stationName || a.stationId || '';
            const nameB = b.stationName || b.stationId || '';
            return nameA.localeCompare(nameB);
        });

        sortedStations.forEach(station => {
            const option = document.createElement('option');
            const stationId = station.stationId || station.stationName;
            const stationName = station.stationName || station.stationId;
            
            option.value = stationId;
            option.textContent = stationName;
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
                if (stationId) {
                    this.selectStation(stationId);
                } else {
                    this.showLoading('Select a station to view observations');
                }
            });
        }
    }

    /**
     * Select and display specific station observations
     * @param {string} stationId - Station ID to display
     */
    selectStation(stationId) {
        if (!stationId || !this.allStations) {
            this.showLoading('Select a station to view observations');
            return;
        }

        // Find the station in our data
        const station = this.allStations.find(s => 
            s.stationId === stationId || s.stationName === stationId
        );

        if (!station) {
            this.showError(`Station ${stationId} not found in current data`);
            return;
        }

        this.selectedStation = stationId;
        this.renderStationObservations(station);
        
        // Save station preference
        try {
            localStorage.setItem('boatsafe_selected_seak_station', stationId);
        } catch (error) {
            console.warn('Failed to save station preference:', error);
        }
    }

    /**
     * Render observations for specific station
     * @param {Object} station - Station data
     */
    renderStationObservations(station) {
        if (!station) {
            this.showError('No station data available');
            return;
        }

        const stationName = station.stationName || station.stationId || 'Unknown Station';
        const stationId = station.stationId || station.stationName;
        
        // Priority order for displaying observation fields (most important first)
        const fieldPriority = [
            'Temperature',
            'Dew Point',
            'Relative Humidity',
            'Wind Direction',
            'Wind Speed',
            'Wind Gust',
            'Sea Level Pressure',
            'Pressure',
            'Visibility',
            'Weather Conditions',
            'Sky Conditions',
            'Ceiling',
            'Precipitation'
        ];

        // Build observation lines in priority order
        const observationLines = [];
        fieldPriority.forEach(fieldKey => {
            const fieldData = station[fieldKey];
            if (fieldData && fieldData.value !== undefined && fieldData.value !== null && 
                fieldData.value !== '-' && fieldData.value !== '' && fieldData.value !== 'M') {
                
                let displayValue = fieldData.value;
                let unit = fieldData.unit || '';
                
                // Apply conversions for marine use (metric to imperial where needed)
                if (fieldKey === 'Temperature' || fieldKey === 'Dew Point') {
                    const converted = this.convertTemp(fieldData.value, unit);
                    displayValue = converted.value;
                    unit = converted.unit;
                } else if (fieldKey === 'Wind Speed' || fieldKey === 'Wind Gust') {
                    const converted = this.convertWindSpeed(fieldData.value, unit);
                    displayValue = converted.value;
                    unit = converted.unit;
                } else if (fieldKey === 'Wind Direction') {
                    const converted = this.convertWindDirection(fieldData.value, unit);
                    displayValue = converted.value;
                    unit = converted.unit;
                }
                
                observationLines.push(
                    `<div class="observation-line">
                        <span class="obs-label">${fieldKey}:</span> 
                        <span class="observation-value">${displayValue}${unit ? ' ' + unit : ''}</span>
                    </div>`
                );
            }
        });

        // If no priority fields found, show all available data
        if (observationLines.length === 0) {
            Object.keys(station).forEach(key => {
                if (key !== 'stationId' && key !== 'stationName' && station[key] && typeof station[key] === 'object') {
                    const fieldData = station[key];
                    if (fieldData.value !== undefined && fieldData.value !== null && 
                        fieldData.value !== '-' && fieldData.value !== '' && fieldData.value !== 'M') {
                        observationLines.push(
                            `<div class="observation-line">
                                <span class="obs-label">${key}:</span> 
                                <span class="observation-value">${fieldData.value}${fieldData.unit ? ' ' + fieldData.unit : ''}</span>
                            </div>`
                        );
                    }
                }
            });
        }

        const html = `
            <div class="forecast-period">
                <div class="period-header">
                    <strong>${stationName}</strong>
                    <span class="period-time">Updated: ${this.formatTime(this.currentData.timestamp || this.currentData.updated)}</span>
                </div>
                <div class="forecast-text observation-data">
                    ${observationLines.length > 0 ? observationLines.join('') : '<div class="observation-line">No current observation data available</div>'}
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
     * Convert temperature from Fahrenheit to Celsius
     * @param {string|number} value - Temperature value
     * @param {string} unit - Current unit
     * @returns {Object} Converted value and unit
     */
    convertTemp(value, unit) {
        if (unit === '°F' || unit === 'F') {
            const celsius = ((parseFloat(value) - 32) * 5/9).toFixed(1);
            return { value: celsius, unit: '°C' };
        }
        return { value: value, unit: unit };
    }

    /**
     * Convert wind speed from mph to knots
     * @param {string|number} value - Wind speed value
     * @param {string} unit - Current unit
     * @returns {Object} Converted value and unit
     */
    convertWindSpeed(value, unit) {
        if (unit === 'mph') {
            const knots = (parseFloat(value) * 0.868976).toFixed(1);
            return { value: knots, unit: 'kt' };
        }
        return { value: value, unit: unit };
    }

    /**
     * Convert wind direction to include cardinal direction
     * @param {string|number} value - Wind direction in degrees
     * @param {string} unit - Current unit
     * @returns {Object} Converted value and unit
     */
    convertWindDirection(value, unit) {
        const degrees = parseFloat(value);
        if (!isNaN(degrees)) {
            const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
            const index = Math.round(degrees / 22.5) % 16;
            const cardinal = directions[index];
            return { value: `${degrees}° (${cardinal})`, unit: '' };
        }
        return { value: value, unit: unit };
    }

    /**
     * Format time for display
     * @param {string} dateString - ISO date string
     * @returns {string} Formatted time string
     */
    formatTime(dateString) {
        if (!dateString) return 'Unknown';
        
        try {
            const date = new Date(dateString);
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
     * Show local development placeholder
     */
    showLocalDevPlaceholder() {
        // Populate dropdown with sample stations for local development
        if (this.stationDropdown) {
            this.stationDropdown.innerHTML = `
                <option value="">Select a station...</option>
                <option value="SITKA">Sitka</option>
                <option value="JUNEAU">Juneau</option>
                <option value="KETCHIKAN">Ketchikan</option>
                <option value="PETERSBURG">Petersburg</option>
                <option value="WRANGELL">Wrangell</option>
            `;
        }
        
        const html = `
            <div class="forecast-period">
                <div class="period-header">
                    <strong>LOCAL DEVELOPMENT MODE</strong>
                    <span class="period-time">Live data requires deployment</span>
                </div>
                <div class="forecast-text observation-data">
                    <div class="observation-line">SEAK marine observations would appear here</div>
                    <div class="observation-line">Deploy to Netlify to see live data from NOAA</div>
                </div>
                <div class="station-link">
                    <a href="https://www.weather.gov/ajk/MarineObservations" target="_blank" rel="noopener">
                        View SEAK Marine Observations →
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
    showLoading(message = 'Loading SEAK observations...') {
        const content = this.observationsDisplay || this.content;
        content.innerHTML = `<div class="loading">${message}</div>`;
    }

    /**
     * Show error state
     * @param {string} message - Error message
     */
    showError(message) {
        const content = this.observationsDisplay || this.content;
        content.innerHTML = `
            <div class="status-message status-error">
                <strong>Error:</strong> ${message}
            </div>
        `;
    }

    /**
     * Update widget with observations data (legacy method)
     * @param {Object} data - Observations data
     */
    update(data) {
        // Legacy compatibility - not used in new implementation
        console.log('Legacy update method called - using new SEAK observations system');
    }

    /**
     * Refresh observations data
     */
    async refresh() {
        this.showLoading('Refreshing observations...');
        await this.loadObservations();
    }

    /**
     * Get current observations data
     * @returns {Object|null} Current observations data
     */
    getData() {
        return this.currentData;
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.SEAKObservations = SEAKObservations;
}