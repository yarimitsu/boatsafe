/**
 * Coastal Forecast Widget
 */
class CoastalForecast {
    constructor() {
        this.container = document.getElementById('coastal-forecast');
        this.content = this.container.querySelector('.coastal-forecast-content');
        this.regionDropdown = document.getElementById('coastal-region-dropdown');
        this.locationDropdown = document.getElementById('coastal-location-dropdown');
        this.forecastDisplay = this.container.querySelector('.coastal-forecast-display');
        this.currentData = null;
        this.currentRegion = null;
        this.selectedLocation = null;
        
        // Define regions and their locations
        this.regions = {
            'CWFAJK': {
                name: 'SE Inner Coastal Waters',
                locations: [
                    'Glacier Bay',
                    'Northern Lynn Canal',
                    'Southern Lynn Canal',
                    'Icy Strait',
                    'Cross Sound',
                    'Stephens Passage',
                    'Northern Chatham Strait',
                    'Southern Chatham Strait',
                    'Frederick Sound',
                    'Sumner Strait',
                    'Clarence Strait'
                ]
            },
            'CWFAEG': {
                name: 'SE Outside Coastal Waters',
                locations: [
                    'Dixon Entrance to Cape Decision',
                    'Cape Decision to Cape Edgecumbe',
                    'Cape Edgecumbe to Cape Spencer',
                    'Cape Spencer to Cape Fairweather',
                    'Cape Fairweather to Icy Cape',
                    'Icy Cape to Cape Suckling'
                ]
            },
            'CWFYAK': {
                name: 'Yakutat Bay',
                locations: [
                    'Yakutat Bay'
                ]
            },
            'CWFAER': {
                name: 'North Gulf Coast/Kodiak/Cook Inlet',
                locations: [
                    'Cape Suckling to Gravel Point',
                    'Gravel Point to Cape Cleare',
                    'Cape Cleare to Gore Point',
                    'Resurrection Bay',
                    'Prince William Sound',
                    'Port of Valdez',
                    'Valdez Narrows',
                    'Valdez Arm',
                    'Passage Canal',
                    'Barren Islands',
                    'Kamishak Bay',
                    'Marmot Island to Sitkinak',
                    'Chiniak Bay',
                    'Marmot Bay',
                    'Shelikof Strait',
                    'Cook Inlet',
                    'Kachemak Bay'
                ]
            },
            'CWFALU': {
                name: 'Southwest AK/Aleutians',
                locations: [
                    'Sitkinak to Castle Cape',
                    'Castle Cape to Cape Tolstoi',
                    'Cape Tolstoi to Cape Sarichef',
                    'Port Heiden to Nelson Lagoon',
                    'Nelson Lagoon to Cape Sarichef',
                    'Cape Sarichef to Nikolski',
                    'Unalaska Bay',
                    'Nikolski to Seguam',
                    'Seguam to Adak'
                ]
            },
            'CWFWCZ': {
                name: 'Northwestern AK',
                locations: [
                    'Kotzebue Sound',
                    'Norton Sound',
                    'Yukon Delta',
                    'Kuskokwim Bay',
                    'Bristol Bay'
                ]
            },
            'CWFNSB': {
                name: 'Arctic',
                locations: [
                    'Beaufort Sea',
                    'Chukchi Sea',
                    'Arctic Ocean'
                ]
            }
        };
        
        this.init();
    }

    /**
     * Initialize the widget
     */
    init() {
        this.showLoading();
        this.setupEventListeners();
        this.populateRegionDropdown();
        this.restorePreferences();
    }

    /**
     * Populate region dropdown
     */
    populateRegionDropdown() {
        if (!this.regionDropdown) return;

        this.regionDropdown.innerHTML = '<option value="">Select a region...</option>';
        
        Object.entries(this.regions).forEach(([regionId, region]) => {
            const option = document.createElement('option');
            option.value = regionId;
            option.textContent = `${regionId} - ${region.name}`;
            this.regionDropdown.appendChild(option);
        });
    }

    /**
     * Populate location dropdown for current region
     */
    populateLocationDropdown() {
        if (!this.locationDropdown || !this.currentRegion) return;

        // Clear existing options
        this.locationDropdown.innerHTML = '<option value="">Select a location...</option>';

        // Add locations for current region
        const region = this.regions[this.currentRegion];
        if (region && region.locations) {
            region.locations.forEach(location => {
                const option = document.createElement('option');
                option.value = location;
                option.textContent = location;
                this.locationDropdown.appendChild(option);
            });
        }
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        if (this.regionDropdown) {
            this.regionDropdown.addEventListener('change', (e) => {
                const regionId = e.target.value;
                this.selectRegion(regionId);
            });
        }
        
        if (this.locationDropdown) {
            this.locationDropdown.addEventListener('change', (e) => {
                const location = e.target.value;
                this.selectLocation(location);
            });
        }
    }

    /**
     * Select a region and load its forecast
     * @param {string} regionId - Region ID
     */
    async selectRegion(regionId) {
        if (!regionId || !this.regions[regionId]) {
            this.locationDropdown.innerHTML = '<option value="">Select a region first...</option>';
            this.showLoading('Select a region to view forecast');
            return;
        }

        this.currentRegion = regionId;
        this.populateLocationDropdown();
        this.showLoading(`Loading forecast for ${this.regions[regionId].name}...`);
        
        try {
            // Fetch forecast data for this region
            const currentHost = window.location.origin;
            const isLocal = currentHost.includes('localhost') || currentHost.includes('127.0.0.1');
            
            let data;
            if (isLocal) {
                // Local development - show placeholder
                data = {
                    regionId: regionId,
                    regionName: this.regions[regionId].name,
                    properties: {
                        updated: new Date().toISOString(),
                        fullText: `LOCAL DEVELOPMENT MODE\n\nCoastal forecast for ${this.regions[regionId].name} would appear here.\n\nDeploy to Netlify to see real coastal forecast data.`,
                        locations: this.regions[regionId].locations.map(loc => ({
                            name: loc,
                            forecast: []
                        })),
                        periods: [{
                            name: 'Coastal Forecast',
                            detailedForecast: `LOCAL DEVELOPMENT MODE\n\nCoastal forecast for ${this.regions[regionId].name} would appear here.\n\nDeploy to Netlify to see real coastal forecast data.`,
                            shortForecast: `Local dev mode - ${regionId}`
                        }]
                    }
                };
            } else {
                // Production - use Netlify function
                const proxyUrl = `${currentHost}/.netlify/functions/coastal-forecast/${regionId}`;
                console.log(`Fetching coastal forecast for ${regionId} from:`, proxyUrl);
                const response = await fetch(proxyUrl);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                data = await response.json();
            }
            
            console.log('Received coastal forecast data:', data);
            
            if (data.properties) {
                this.currentData = data;
                this.renderRegionForecast();
                
                // Save region preference
                try {
                    localStorage.setItem('boatsafe_coastal_region', regionId);
                } catch (error) {
                    console.warn('Failed to save region preference:', error);
                }
            } else {
                throw new Error('No forecast data received - invalid response structure');
            }
        } catch (error) {
            console.error('Failed to load coastal forecast:', error);
            this.showError(`Failed to load forecast for ${regionId}: ${error.message}`);
        }
    }

    /**
     * Select and display specific location forecast
     * @param {string} location - Location name to display
     */
    selectLocation(location) {
        if (!location || !this.currentData) {
            this.renderRegionForecast();
            return;
        }

        this.selectedLocation = location;
        this.renderLocationForecast(location);
        
        // Save location preference
        try {
            localStorage.setItem('boatsafe_coastal_location', location);
        } catch (error) {
            console.warn('Failed to save location preference:', error);
        }
    }

    /**
     * Render forecast for entire region
     */
    renderRegionForecast() {
        if (!this.currentData || !this.currentData.properties) {
            this.showError('No forecast data available');
            return;
        }

        const regionName = this.currentData.regionName || this.currentRegion;
        const fullText = this.currentData.properties.fullText || this.currentData.properties.periods[0].detailedForecast;
        
        // Show complete forecast text for region
        const html = `
            <div class="forecast-header">
                <strong>${this.currentRegion} - ${regionName}</strong>
                <small>Updated: ${this.formatDate(new Date(this.currentData.properties.updated))}</small>
            </div>
            <div class="region-forecast">
                <pre class="forecast-text">${fullText}</pre>
            </div>
        `;

        if (this.forecastDisplay) {
            this.forecastDisplay.innerHTML = html;
        } else {
            this.content.innerHTML = html;
        }
    }

    /**
     * Render forecast for specific location
     * @param {string} location - Location name
     */
    renderLocationForecast(location) {
        if (!this.currentData || !this.currentData.properties) {
            this.showError('No forecast data available');
            return;
        }

        const fullText = this.currentData.properties.fullText || this.currentData.properties.periods[0].detailedForecast;
        const locationForecast = this.extractLocationForecast(fullText, location);
        
        if (!locationForecast) {
            this.showError(`Forecast for ${location} not found in current data`);
            return;
        }

        const regionName = this.currentData.regionName || this.currentRegion;
        
        const html = `
            <div class="forecast-header">
                <strong>${location}</strong>
                <small>${this.currentRegion} - ${regionName}</small>
                <small>Updated: ${this.formatDate(new Date(this.currentData.properties.updated))}</small>
            </div>
            <div class="location-forecast">
                <pre class="forecast-text">${locationForecast}</pre>
            </div>
        `;

        if (this.forecastDisplay) {
            this.forecastDisplay.innerHTML = html;
        } else {
            this.content.innerHTML = html;
        }
    }

    /**
     * Extract forecast text for specific location
     * @param {string} fullText - Complete forecast text
     * @param {string} location - Location name to extract
     * @returns {string|null} Location-specific forecast text
     */
    extractLocationForecast(fullText, location) {
        const lines = fullText.split('\n');
        let locationStartIndex = -1;
        let locationEndIndex = -1;
        
        // Find the start of the location section
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.toUpperCase().includes(location.toUpperCase()) || 
                line.toUpperCase().includes(location.toUpperCase().replace(/\s+/g, ''))) {
                locationStartIndex = i;
                break;
            }
        }
        
        if (locationStartIndex === -1) {
            return null;
        }
        
        // Find the end of the location section (next location or end of text)
        for (let i = locationStartIndex + 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.endsWith('-') && line.length > 3 && !line.includes('$$')) {
                locationEndIndex = i;
                break;
            }
        }
        
        if (locationEndIndex === -1) {
            locationEndIndex = lines.length;
        }
        
        return lines.slice(locationStartIndex, locationEndIndex).join('\n').trim();
    }

    /**
     * Restore saved preferences
     */
    restorePreferences() {
        try {
            const savedRegion = localStorage.getItem('boatsafe_coastal_region');
            if (savedRegion && this.regions[savedRegion]) {
                this.regionDropdown.value = savedRegion;
                this.selectRegion(savedRegion);
                
                // Also restore saved location if available
                setTimeout(() => {
                    const savedLocation = localStorage.getItem('boatsafe_coastal_location');
                    if (savedLocation) {
                        this.locationDropdown.value = savedLocation;
                        this.selectLocation(savedLocation);
                    }
                }, 100);
            }
        } catch (error) {
            console.warn('Failed to restore preferences:', error);
        }
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
    showLoading(message = 'Loading coastal forecast...') {
        const content = this.forecastDisplay || this.content;
        content.innerHTML = `<div class="loading">${message}</div>`;
    }

    /**
     * Show error state
     * @param {string} message - Error message
     */
    showError(message) {
        const content = this.forecastDisplay || this.content;
        content.innerHTML = `
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
        this.currentRegion = null;
        this.selectedLocation = null;
        this.showLoading('Select a region to view coastal forecast');
    }

    /**
     * Get current forecast data
     * @returns {Object|null} Current forecast data
     */
    getData() {
        return this.currentData;
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.CoastalForecast = CoastalForecast;
}