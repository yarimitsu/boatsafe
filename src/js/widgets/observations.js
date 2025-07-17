/**
 * Observations Widget - NDBC Alaska Buoy Observations
 */
class Observations {
    constructor() {
        this.container = document.getElementById('observations');
        this.content = this.container.querySelector('.observations-content');
        this.stationDropdown = document.getElementById('station-dropdown');
        this.observationsDisplay = this.container.querySelector('.observations-display');
        this.currentData = null;
        this.selectedStation = null;
        
        // Alaska NDBC stations
        this.stations = {
            // Offshore Buoy Stations
            '46001': 'WESTERN GULF OF ALASKA',
            '46004': 'Middle Nomad',
            '46035': 'CENTRAL BERING SEA',
            '46036': 'South Nomad',
            '46060': 'WEST ORCA BAY',
            '46061': 'Seal Rocks',
            '46066': 'SOUTH KODIAK',
            '46072': 'CENTRAL ALEUTIANS',
            '46073': 'SOUTHEAST BERING SEA',
            '46075': 'SHUMAGIN ISLANDS',
            '46076': 'CAPE CLEARE',
            '46077': 'SHELIKOF STRAIT',
            '46078': 'ALBATROSS BANK',
            '46080': 'PORTLOCK BANK',
            '46081': 'Western Prince William Sound',
            '46082': 'Cape Suckling',
            '46083': 'FAIRWEATHER GROUND',
            '46084': 'CAPE EDGECUMBE',
            '46085': 'CENTRAL GULF OF ALASKA',
            '46108': 'Lower Cook Inlet',
            '46131': 'Sentry Shoal',
            '46132': 'South Brooks',
            '46145': 'Central Dixon Entrance Buoy',
            '46146': 'Halibut Bank',
            '46147': 'South Moresby',
            '46181': 'Nanakwa Shoal',
            '46183': 'North Hecate Strait',
            '46184': 'North Nomad',
            '46185': 'South Hecate Strait',
            '46204': 'West Sea Otter',
            '46205': 'West Dixon Entrance',
            '46206': 'La Perouse Bank',
            '46207': 'East Dellwood',
            '46208': 'West Moresby',
            '46246': 'Ocean Station PAPA',
            '46267': 'Angeles Point',
            '46303': 'Southern Georgia Strait',
            '46304': 'Entrance To English Bay',
            
            // Coastal/Land Stations
            'ABYA2': 'Auke Bay Lab Dock',
            'ADKA2': 'Adak Island',
            'AJXA2': 'Juneau AJ Dock',
            'AKXA2': 'Akutan',
            'ANTA2': 'Anchorage',
            'NMTA2': 'Nome',
            'UNLA2': 'Unalaska',
            'UQXA2': 'Utqiagvik'
        };
        
        this.init();
    }

    /**
     * Initialize the widget
     */
    init() {
        this.populateStationDropdown();
        this.setupEventListeners();
        this.showLoading();
    }

    /**
     * Populate station dropdown
     */
    populateStationDropdown() {
        if (!this.stationDropdown) return;

        this.stationDropdown.innerHTML = '<option value="">Select a station...</option>';
        
        Object.entries(this.stations).forEach(([stationId, stationName]) => {
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
                if (stationId) {
                    this.selectStation(stationId);
                } else {
                    this.showLoading();
                }
            });
        }
    }

    /**
     * Select and load station observations
     * @param {string} stationId - Station ID
     */
    async selectStation(stationId) {
        if (!stationId) {
            this.showLoading();
            return;
        }

        this.selectedStation = stationId;
        this.showLoading(`Loading observations for ${stationId}...`);

        try {
            const currentHost = window.location.origin;
            const isLocal = currentHost.includes('localhost') || currentHost.includes('127.0.0.1');
            
            if (isLocal) {
                // Local development - try to test with live data, fallback to placeholder
                try {
                    const data = await this.fetchStationDataDirect(stationId);
                    this.currentData = data;
                    this.render();
                } catch (error) {
                    console.warn('Failed to fetch live data in development, showing placeholder:', error);
                    this.showLocalDevPlaceholder(stationId);
                }
            } else {
                // Production - fetch real data via Netlify function
                const data = await this.fetchStationData(stationId);
                this.currentData = data;
                this.render();
            }
            
            // Save station preference
            try {
                localStorage.setItem('boatsafe_selected_station', stationId);
            } catch (error) {
                console.warn('Failed to save station preference:', error);
            }
        } catch (error) {
            console.error('Failed to load station observations:', error);
            this.showError(`Failed to load observations for ${stationId}`);
        }
    }

    /**
     * Fetch station data directly from NDBC (for development testing)
     * @param {string} stationId - Station ID
     * @returns {Promise} Station data
     */
    async fetchStationDataDirect(stationId) {
        const url = `https://www.ndbc.noaa.gov/data/realtime2/${stationId}.txt`;
        
        try {
            console.log(`Fetching buoy data directly from: ${url}`);
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const text = await response.text();
            console.log(`Got buoy data (${text.length} chars)`);
            
            // Parse and return structured data
            const data = this.parseNDBCData(text, stationId);
            
            return {
                stationId: data.stationId,
                stationName: this.stations[data.stationId] || data.stationId,
                timestamp: new Date(data.timestamp),
                data: data.data
            };
        } catch (error) {
            console.error('Direct buoy data fetch error:', error);
            throw new Error('Unable to fetch station data directly from NDBC');
        }
    }

    /**
     * Parse NDBC data text into structured format
     * @param {string} text - Raw NDBC data text
     * @param {string} stationId - Station ID
     * @returns {Object} Parsed data
     */
    parseNDBCData(text, stationId) {
        const lines = text.split('\n').filter(line => line.trim());
        
        if (lines.length < 3) {
            throw new Error('Invalid NDBC data format');
        }
        
        const headerLine = lines[0];
        const unitLine = lines[1];
        const dataLine = lines[2]; // Most recent data
        
        const headers = headerLine.split(/\s+/);
        const units = unitLine.split(/\s+/);
        const values = dataLine.split(/\s+/);
        
        // Create data object
        const data = {};
        headers.forEach((header, index) => {
            data[header] = {
                value: values[index] || 'MM',
                unit: units[index] || ''
            };
        });
        
        // Parse timestamp
        const timestamp = this.parseTimestamp(data);
        
        return {
            stationId,
            timestamp: timestamp.toISOString(),
            data: data,
            parsed: timestamp,
            status: 'success'
        };
    }

    /**
     * Parse timestamp from NDBC data
     * @param {Object} data - NDBC data object
     * @returns {Date} Parsed timestamp
     */
    parseTimestamp(data) {
        try {
            const year = parseInt(data.YY?.value || data.YYYY?.value) || new Date().getFullYear();
            const month = parseInt(data.MM?.value) || 1;
            const day = parseInt(data.DD?.value) || 1;
            const hour = parseInt(data.hh?.value) || 0;
            const minute = parseInt(data.mm?.value) || 0;
            
            return new Date(year, month - 1, day, hour, minute);
        } catch (error) {
            return new Date();
        }
    }

    /**
     * Fetch station data from NDBC via Netlify function
     * @param {string} stationId - Station ID
     * @returns {Promise} Station data
     */
    async fetchStationData(stationId) {
        const currentHost = window.location.origin;
        const proxyUrl = `${currentHost}/.netlify/functions/buoy-data/${stationId.toUpperCase()}`;
        
        try {
            console.log(`Fetching buoy data for ${stationId} from:`, proxyUrl);
            const response = await fetch(proxyUrl);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Received buoy data:', data);
            
            if (data.status === 'success') {
                return {
                    stationId: data.stationId,
                    stationName: this.stations[data.stationId] || data.stationId,
                    timestamp: new Date(data.timestamp),
                    data: data.data
                };
            } else {
                throw new Error('Invalid response format');
            }
        } catch (error) {
            console.error('Buoy data fetch error:', error);
            throw new Error('Unable to fetch station data');
        }
    }


    /**
     * Show local development placeholder
     * @param {string} stationId - Station ID
     */
    showLocalDevPlaceholder(stationId) {
        const stationName = this.stations[stationId] || stationId;
        
        const html = `
            <div class="station-data">
                <div class="station-header">
                    <strong>${stationId} - ${stationName}</strong>
                    <div class="station-time">Local Development Mode</div>
                </div>
                <div class="observation-items">
                    <div class="observation-item">
                        <span class="label">Wind Speed:</span>
                        <span class="value">-- kt</span>
                    </div>
                    <div class="observation-item">
                        <span class="label">Wind Direction:</span>
                        <span class="value">-- °</span>
                    </div>
                    <div class="observation-item">
                        <span class="label">Wave Height:</span>
                        <span class="value">-- m</span>
                    </div>
                    <div class="observation-item">
                        <span class="label">Air Temperature:</span>
                        <span class="value">-- °C</span>
                    </div>
                    <div class="observation-item">
                        <span class="label">Pressure:</span>
                        <span class="value">-- hPa</span>
                    </div>
                </div>
                <div class="local-dev-note">
                    <em>Deploy to Netlify to see real buoy data</em>
                </div>
            </div>
        `;
        
        if (this.observationsDisplay) {
            this.observationsDisplay.innerHTML = html;
        }
    }

    /**
     * Render the observations
     */
    render() {
        if (!this.currentData) {
            this.showError('No observation data available');
            return;
        }

        const data = this.currentData;
        
        // Key observation fields
        const keyFields = [
            { key: 'WSPD', label: 'Wind Speed', unit: 'kt' },
            { key: 'WDIR', label: 'Wind Direction', unit: '°' },
            { key: 'WVHT', label: 'Wave Height', unit: 'm' },
            { key: 'DPD', label: 'Dominant Wave Period', unit: 's' },
            { key: 'ATMP', label: 'Air Temperature', unit: '°C' },
            { key: 'WTMP', label: 'Water Temperature', unit: '°C' },
            { key: 'PRES', label: 'Pressure', unit: 'hPa' }
        ];

        // Format observations as separate lines for better readability
        const observationLines = keyFields.map(field => {
            const fieldData = data.data[field.key];
            const value = fieldData ? fieldData.value : 'N/A';
            const unit = fieldData ? fieldData.unit : field.unit;
            const displayValue = value === 'MM' ? 'N/A' : value;
            return `<div class="observation-line">${field.label}: <span class="observation-value">${displayValue} ${unit}</span></div>`;
        }).join('');

        const html = `
            <div class="forecast-period">
                <div class="period-header">
                    <strong>${data.stationId} - ${data.stationName}</strong>
                    <span class="period-time">${this.formatTime(data.timestamp)}</span>
                </div>
                <div class="forecast-text observation-data">
                    ${observationLines}
                </div>
                <div class="station-link">
                    <a href="https://www.ndbc.noaa.gov/station_page.php?station=${data.stationId}" 
                       target="_blank" rel="noopener">View Full Station Data →</a>
                </div>
            </div>
        `;

        if (this.observationsDisplay) {
            this.observationsDisplay.innerHTML = html;
        }
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
            return date.toLocaleDateString();
        }
    }

    /**
     * Show loading state
     */
    showLoading(message = 'Loading observations...') {
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
     * @param {Array} data - Array of observation data
     */
    update(data) {
        // Legacy compatibility - not used in new implementation
        console.log('Legacy update method called - using new station-based system');
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Observations = Observations;
}