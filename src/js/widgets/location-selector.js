/**
 * Location Selector Widget
 */
class LocationSelector {
    constructor(zones, onSelectionCallback) {
        this.zones = zones;
        this.onSelection = onSelectionCallback;
        this.selectedRegion = null;
        
        this.container = document.getElementById('location-selector');
        this.regionDropdown = document.getElementById('region-dropdown');
        
        this.init();
    }

    /**
     * Initialize the widget
     */
    init() {
        this.setupEventListeners();
        this.populateRegionDropdown();
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Region dropdown selection
        if (this.regionDropdown) {
            this.regionDropdown.addEventListener('change', (e) => {
                const regionId = e.target.value;
                if (regionId) {
                    this.selectRegion(regionId);
                } else {
                    this.clearSelection();
                }
            });
        }
    }

    /**
     * Populate dropdown with regions
     */
    populateRegionDropdown() {
        console.log('LocationSelector.populateRegionDropdown called');
        console.log('this.regionDropdown:', this.regionDropdown);
        console.log('this.zones:', this.zones);
        
        if (!this.regionDropdown) {
            console.error('Region dropdown element not found');
            return;
        }
        
        if (!this.zones || !this.zones.regions) {
            console.error('No zones.regions data available:', this.zones);
            return;
        }

        const regions = Object.entries(this.zones.regions);
        console.log('Regions to populate:', regions);
        
        // Clear existing options (except the first placeholder)
        this.regionDropdown.innerHTML = '<option value="">Select a region...</option>';
        
        // Add regions to dropdown
        regions.forEach(([id, region]) => {
            console.log(`Adding region: ${id} - ${region.name}`);
            const option = document.createElement('option');
            option.value = id;
            option.textContent = region.name;
            this.regionDropdown.appendChild(option);
        });
        
        console.log('Region dropdown populated with', regions.length, 'regions');
    }

    /**
     * Select a region
     * @param {string} regionId - Region ID
     */
    selectRegion(regionId) {
        if (!this.zones.regions[regionId]) {
            console.error('Invalid region ID:', regionId);
            return;
        }

        // Update selection
        this.selectedRegion = regionId;
        
        // Update dropdown
        if (this.regionDropdown) {
            this.regionDropdown.value = regionId;
        }

        // Notify callback with region data
        if (this.onSelection) {
            this.onSelection(regionId);
        }
    }

    /**
     * Set selected region (external API)
     * @param {string} regionId - Region ID
     */
    setSelected(regionId) {
        this.selectRegion(regionId);
    }

    /**
     * Get selected region
     * @returns {string|null} Selected region ID
     */
    getSelected() {
        return this.selectedRegion;
    }

    /**
     * Clear selection
     */
    clearSelection() {
        this.selectedRegion = null;
        
        // Reset dropdown
        if (this.regionDropdown) {
            this.regionDropdown.value = '';
        }
    }

    /**
     * Get region data
     * @param {string} regionId - Region ID
     * @returns {Object|null} Region data
     */
    getRegionData(regionId) {
        return this.zones.regions[regionId] || null;
    }

    /**
     * Update zones data
     * @param {Object} zones - New zones data
     */
    updateZones(zones) {
        this.zones = zones;
        this.populateRegionDropdown();
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.LocationSelector = LocationSelector;
}