/**
 * Weather Forecast Widget
 * Displays current weather forecast for Alaska weather zones (AKZ317-AKZ332)
 */
class WeatherWidget {
    constructor() {
        this.container = document.getElementById('weather');
        this.content = this.container.querySelector('.weather-content');
        this.zoneDropdown = document.getElementById('weather-location-dropdown');
        this.weatherDisplay = this.container.querySelector('.weather-data-container');
        this.currentData = null;
        this.selectedZone = null;
        
        // Alaska weather zones mapping (Southeast Alaska)
        this.zones = {
            'AKZ317': 'City and Borough of Yakutat',
            'AKZ318': 'Municipality of Skagway',
            'AKZ319': 'Haines Borough and Klukwan',
            'AKZ320': 'Glacier Bay',
            'AKZ321': 'Eastern Chichagof Island',
            'AKZ322': 'Cape Fairweather to Lisianski Strait',
            'AKZ323': 'City and Borough of Sitka',
            'AKZ324': 'Admiralty Island',
            'AKZ325': 'City and Borough of Juneau',
            'AKZ326': 'Petersburg Borough',
            'AKZ327': 'Western Kupreanof and Kuiu Island',
            'AKZ328': 'Prince of Wales Island',
            'AKZ329': 'City and Borough of Wrangell',
            'AKZ330': 'Ketchikan Gateway Borough',
            'AKZ331': 'City of Hyder',
            'AKZ332': 'Annette Island'
        };
        
        this.init();
    }

    /**
     * Initialize the widget
     */
    init() {
        this.showLoading();
        this.populateZoneDropdown();
        this.setupEventListeners();
        this.restoreSelection();
    }

    /**
     * Populate zone dropdown with Alaska weather zones
     */
    populateZoneDropdown() {
        if (!this.zoneDropdown) return;

        // Clear existing options except the first one
        this.zoneDropdown.innerHTML = '<option value="">Select a location...</option>';
        
        // Add all Alaska weather zones
        Object.entries(this.zones).forEach(([zoneId, zoneName]) => {
            const option = document.createElement('option');
            option.value = zoneId;
            option.textContent = `${zoneId} - ${zoneName}`;
            this.zoneDropdown.appendChild(option);
        });
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
     * Restore previous selection from localStorage
     */
    restoreSelection() {
        try {
            const savedZone = localStorage.getItem('boatsafe_weather_zone');
            if (savedZone && this.zones[savedZone]) {
                this.zoneDropdown.value = savedZone;
                this.selectZone(savedZone);
            }
        } catch (error) {
            console.warn('Failed to restore weather zone preference:', error);
        }
    }

    /**
     * Select and display specific zone weather
     * @param {string} zoneId - Zone ID to display
     */
    async selectZone(zoneId) {
        if (!zoneId) {
            this.showLoading('Select a location to view weather forecast');
            return;
        }

        if (!this.zones[zoneId]) {
            this.showError(`Invalid zone: ${zoneId}`);
            return;
        }

        this.selectedZone = zoneId;
        this.showLoading(`Loading weather forecast for ${this.zones[zoneId]}...`);
        
        try {
            // Fetch weather data for this specific zone
            const currentHost = window.location.origin;
            const isLocal = currentHost.includes('localhost') || currentHost.includes('127.0.0.1');
            
            let data;
            if (isLocal) {
                // Local development - no fake data
                throw new Error('Weather data not available in development mode. Deploy to production to see live weather forecasts.');
            } else {
                // Production - use Netlify function
                const proxyUrl = `${currentHost}/.netlify/functions/weather-forecast/${zoneId}`;
                console.log(`Fetching weather for ${zoneId} from:`, proxyUrl);
                const response = await fetch(proxyUrl);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                data = await response.json();
            }
            
            console.log('Received weather data:', data);
            
            if (data.properties && data.properties.periods) {
                this.currentData = data;
                this.renderWeatherForecast();
                
                // Save zone preference
                try {
                    localStorage.setItem('boatsafe_weather_zone', zoneId);
                } catch (error) {
                    console.warn('Failed to save weather zone preference:', error);
                }
            } else {
                throw new Error('No weather data received - invalid response structure');
            }
        } catch (error) {
            console.error('Failed to load weather forecast:', error);
            console.error('Error details:', error.message);
            this.showError(`Failed to load weather forecast for ${this.zones[zoneId]}: ${error.message}`);
        }
    }

    /**
     * Render weather forecast data
     */
    renderWeatherForecast() {
        if (!this.currentData || !this.currentData.properties) {
            this.showError('No weather data available');
            return;
        }

        const { properties } = this.currentData;
        const { zone, zoneName, updated, periods } = properties;
        
        if (!periods || periods.length === 0) {
            this.showError('No weather forecast periods available');
            return;
        }

        const forecastText = periods[0].detailedForecast;
        const displayName = zoneName || this.zones[zone] || zone;
        
        // Clean up and format forecast text
        const cleanForecast = this.formatForecastText(forecastText);
        
        const html = `
            <div class="forecast-period">
                <div class="period-header">
                    <div class="forecast-title">
                        <strong>${displayName}</strong>
                        <span class="zone-id">${zone}</span>
                    </div>
                    <div class="forecast-time">
                        <span class="period-time">Updated: ${this.formatDate(new Date(updated))}</span>
                    </div>
                </div>
                <div class="forecast-text">
                    ${cleanForecast}
                </div>
                <div class="weather-link">
                    <a href="https://www.weather.gov/arh/lfpfcst.html?AJK=${zone}" target="_blank" rel="noopener">
                        View on Weather.gov →
                    </a>
                </div>
            </div>
        `;

        this.weatherDisplay.innerHTML = html;
    }

    /**
     * Format and clean forecast text
     * @param {string} text - Raw forecast text
     * @returns {string} Formatted text
     */
    formatForecastText(text) {
        if (!text) return 'No forecast available';
        
        // Remove HTML tags if any
        let cleaned = text.replace(/<[^>]*>/g, '');
        
        // Clean up extra whitespace
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        
        // Split into lines for better readability
        const lines = cleaned.split(/\.\s+/);
        
        // Rejoin with proper punctuation and line breaks
        return lines
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => line.endsWith('.') ? line : line + '.')
            .join('\n\n');
    }

    /**
     * Format date for display (matches discussion widget style)
     * @param {Date} date - Date object
     * @returns {string} Formatted date string
     */
    formatDate(date) {
        if (!date) return 'Unknown';
        
        try {
            return new Date(date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return 'Unknown';
        }
    }

    /**
     * Show loading state
     * @param {string} message - Loading message
     */
    showLoading(message = 'Loading weather forecast...') {
        this.weatherDisplay.innerHTML = `<div class="loading">${message}</div>`;
    }

    /**
     * Show error state
     * @param {string} message - Error message
     */
    showError(message) {
        this.weatherDisplay.innerHTML = `
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
        this.selectedZone = null;
        if (this.zoneDropdown) {
            this.zoneDropdown.value = '';
        }
        this.showLoading('Select a location to view weather forecast');
    }

    /**
     * Get current weather data
     * @returns {Object|null} Current weather data
     */
    getData() {
        return this.currentData;
    }

    /**
     * Export weather data as text
     * @returns {string} Text representation
     */
    exportAsText() {
        if (!this.currentData) return '';
        
        const { properties } = this.currentData;
        const { zone, zoneName, updated, periods } = properties;
        
        let text = `Weather Forecast for ${zoneName || zone}\n`;
        text += `Zone: ${zone}\n`;
        text += `Updated: ${this.formatDate(new Date(updated))}\n\n`;
        
        if (periods && periods.length > 0) {
            text += `${periods[0].name}:\n`;
            text += `${periods[0].detailedForecast}\n\n`;
        }
        
        return text;
    }

    /**
     * Refresh current selection
     */
    refresh() {
        if (this.selectedZone) {
            this.selectZone(this.selectedZone);
        }
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.WeatherWidget = WeatherWidget;
}