/**
 * Location Selector Widget
 */
class LocationSelector {
    constructor(zones, onSelectionCallback) {
        this.zones = zones;
        this.onSelection = onSelectionCallback;
        this.selectedZone = null;
        this.filteredZones = { ...zones };
        
        this.container = document.getElementById('location-selector');
        this.dropdown = document.getElementById('zone-dropdown');
        this.regionFilters = document.querySelectorAll('.region-filter');
        
        this.init();
    }

    /**
     * Initialize the widget
     */
    init() {
        this.setupEventListeners();
        this.populateDropdown();
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Dropdown selection
        if (this.dropdown) {
            this.dropdown.addEventListener('change', (e) => {
                const zoneId = e.target.value;
                if (zoneId) {
                    this.selectZone(zoneId);
                } else {
                    this.clearSelection();
                }
            });
        }

        // Region filters
        this.regionFilters.forEach(filter => {
            filter.addEventListener('click', (e) => {
                this.setActiveRegion(e.target.dataset.region);
            });
        });
    }

    /**
     * Populate dropdown with zones
     */
    populateDropdown() {
        if (!this.dropdown) return;

        const zones = Object.entries(this.filteredZones);
        
        // Clear existing options (except the first placeholder)
        this.dropdown.innerHTML = '<option value="">Select a zone...</option>';
        
        if (zones.length === 0) {
            this.dropdown.innerHTML = '<option value="">No zones available</option>';
            return;
        }

        // Sort zones by name
        zones.sort((a, b) => a[1].name.localeCompare(b[1].name));

        // Add zones to dropdown
        zones.forEach(([id, zone]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = `${zone.name} (${id})`;
            option.dataset.region = zone.region;
            this.dropdown.appendChild(option);
        });
    }

    /**
     * Set active region filter
     * @param {string} region - Region name or 'all'
     */
    setActiveRegion(region) {
        // Update filter buttons
        this.regionFilters.forEach(filter => {
            filter.classList.remove('active');
            if (filter.dataset.region === region) {
                filter.classList.add('active');
            }
        });

        // Filter zones by region
        if (region === 'all') {
            this.filteredZones = { ...this.zones };
        } else {
            this.filteredZones = {};
            
            Object.entries(this.zones).forEach(([id, zone]) => {
                if (zone.region === region) {
                    this.filteredZones[id] = zone;
                }
            });
        }
        
        // Clear current selection if it's not in the filtered zones
        if (this.selectedZone && !this.filteredZones[this.selectedZone]) {
            this.clearSelection();
        }
        
        this.populateDropdown();
    }


    /**
     * Select a zone
     * @param {string} zoneId - Zone ID
     */
    selectZone(zoneId) {
        if (!this.zones[zoneId]) {
            console.error('Invalid zone ID:', zoneId);
            return;
        }

        // Update selection
        this.selectedZone = zoneId;
        
        // Update dropdown
        if (this.dropdown) {
            this.dropdown.value = zoneId;
        }

        // Notify callback
        if (this.onSelection) {
            this.onSelection(zoneId);
        }
    }

    /**
     * Set selected zone (external API)
     * @param {string} zoneId - Zone ID
     */
    setSelected(zoneId) {
        this.selectZone(zoneId);
    }

    /**
     * Get selected zone
     * @returns {string|null} Selected zone ID
     */
    getSelected() {
        return this.selectedZone;
    }

    /**
     * Clear selection
     */
    clearSelection() {
        this.selectedZone = null;
        
        // Reset dropdown
        if (this.dropdown) {
            this.dropdown.value = '';
        }
    }

    /**
     * Get zone data
     * @param {string} zoneId - Zone ID
     * @returns {Object|null} Zone data
     */
    getZoneData(zoneId) {
        return this.zones[zoneId] || null;
    }

    /**
     * Update zones data
     * @param {Object} zones - New zones data
     */
    updateZones(zones) {
        this.zones = zones;
        this.filteredZones = { ...zones };
        this.populateDropdown();
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.LocationSelector = LocationSelector;
}