/**
 * Weather Warnings & Advisories Widget
 * Active NWS alerts for Alaska (api.weather.gov, CORS-enabled). Filterable by
 * region; each alert is a collapsed summary the user taps to expand.
 */
class WeatherWidget {
    static REGIONS = {
        all: 'Alaska',
        southeast: 'Southeast Alaska',
        southcentral: 'Southcentral Alaska',
        northern: 'Northern Alaska'
    };
    static SEVERITY_RANK = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1, Unknown: 0 };

    constructor() {
        this.container = document.getElementById('weather');
        this.content = this.container.querySelector('.weather-content');
        this.display = this.container.querySelector('.weather-display');
        this.toggleButton = document.getElementById('weather-toggle');
        this.regionBtns = this.container.querySelector('.weather-region-btns');
        this.isExpanded = true;
        this.region = 'all';
        this.alerts = [];

        this.init();
    }

    init() {
        this.setupToggleButton();
        this.setupRegionSelector();
        this.showLoading();
        this.loadWarnings();
        setInterval(() => { if (!document.hidden) this.loadWarnings(); }, 15 * 60 * 1000);
    }

    setupToggleButton() {
        if (!this.toggleButton) return;
        this.toggleButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.isExpanded = !this.isExpanded;
            this.content.style.display = this.isExpanded ? 'block' : 'none';
            this.toggleButton.setAttribute('aria-expanded', String(this.isExpanded));
            const chevron = this.toggleButton.querySelector('.chevron-icon');
            if (chevron) chevron.classList.toggle('expanded', this.isExpanded);
        });
    }

    setupRegionSelector() {
        if (!this.regionBtns) return;
        this.regionBtns.addEventListener('click', (e) => {
            const btn = e.target.closest('.map-region-btn');
            if (!btn) return;
            this.regionBtns.querySelectorAll('.map-region-btn')
                .forEach(b => b.classList.toggle('active', b === btn));
            this.region = btn.dataset.value || 'all';
            this.render();
        });
    }

    /** Map an alert to a region via the issuing office in senderName. */
    static regionOf(feature) {
        const s = (feature.properties?.senderName || '').toLowerCase();
        if (s.includes('juneau')) return 'southeast';
        if (s.includes('anchorage')) return 'southcentral';
        if (s.includes('fairbanks')) return 'northern';
        return 'other';
    }

    async loadWarnings() {
        try {
            const res = await window.BoatSafe.http.get(
                'https://api.weather.gov/alerts/active?area=AK', { cacheTTL: 10 });
            // api.weather.gov sends application/geo+json, returned as a string
            const data = typeof res === 'string' ? JSON.parse(res) : res;
            this.alerts = Array.isArray(data.features) ? data.features : [];
            this.render();
        } catch (error) {
            console.error('Failed to load weather alerts:', error);
            this.showError(`Failed to load weather alerts: ${error.message}`);
        }
    }

    render() {
        if (!this.display) return;
        const label = WeatherWidget.REGIONS[this.region] || 'Alaska';
        const inRegion = this.region === 'all'
            ? this.alerts
            : this.alerts.filter(f => WeatherWidget.regionOf(f) === this.region);

        const header = `
            <div class="warnings-header">
                <div class="office-info">
                    <strong>${this.esc(label)} Warnings &amp; Advisories</strong>
                    <div class="warning-meta">
                        <span class="last-updated">${inRegion.length} active · checked ${this.formatDate(new Date())}</span>
                        <a href="https://www.weather.gov/safety" target="_blank" rel="noopener" class="noaa-link">NOAA alerts →</a>
                    </div>
                </div>
            </div>`;

        // No advisory for this area -> neutral message, no orange/red.
        if (inRegion.length === 0) {
            this.display.innerHTML = header +
                `<div class="status-clear">No active warnings or advisories for ${this.esc(label)}.</div>`;
            return;
        }

        const rank = WeatherWidget.SEVERITY_RANK;
        const sorted = [...inRegion].sort((a, b) => {
            const bySeverity = (rank[b.properties.severity] || 0) - (rank[a.properties.severity] || 0);
            if (bySeverity) return bySeverity;
            return new Date(b.properties.effective || 0) - new Date(a.properties.effective || 0);
        });

        this.display.innerHTML = header +
            '<div class="alert-list">' + sorted.map(f => this.renderAlert(f)).join('') + '</div>';
    }

    /** A collapsed alert: severity + event + area in the summary; full text on expand. */
    renderAlert(feature) {
        const p = feature.properties || {};
        const esc = WeatherWidget.escapeHtml;
        const sev = p.severity || 'Unknown';
        const sevClass = 'severity-' + sev.toLowerCase();

        const desc = p.description ? esc(p.description).replace(/\n/g, '<br>') : '';
        const instruction = p.instruction ? esc(p.instruction).replace(/\n/g, '<br>') : '';
        const body = desc + (instruction
            ? `<br><br><strong>Precautionary/preparedness actions:</strong><br>${instruction}` : '');
        const when = (p.effective && p.expires)
            ? `${this.formatDate(new Date(p.effective))} – ${this.formatDate(new Date(p.expires))}` : '';

        return `
            <details class="alert-item ${sevClass}">
                <summary class="alert-summary">
                    <span class="alert-caret">▸</span>
                    <span class="alert-sev">${esc(sev)}</span>
                    <span class="alert-event">${esc(p.event || 'Weather Alert')}</span>
                    ${p.areaDesc ? `<span class="alert-area">${esc(p.areaDesc)}</span>` : ''}
                </summary>
                <div class="alert-detail">
                    ${when ? `<div class="alert-when"><strong>In effect:</strong> ${when}</div>` : ''}
                    <div class="alert-text">${body || 'No further detail provided.'}</div>
                </div>
            </details>`;
    }

    static escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    esc(s) { return WeatherWidget.escapeHtml(s); }

    formatDate(date) {
        if (!date) return 'Unknown';
        try {
            return new Date(date).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
            });
        } catch (error) {
            return 'Unknown';
        }
    }

    showLoading(message = 'Loading weather warnings...') {
        if (this.display) this.display.innerHTML = `<div class="loading">${this.esc(message)}</div>`;
    }

    showError(message) {
        if (this.display) {
            this.display.innerHTML = `
                <div class="status-message status-error">
                    <strong>Error:</strong> ${this.esc(message)}
                    <br><br>
                    <button onclick="window.WeatherWidget.instance.loadWarnings()" class="retry-btn">Retry Loading</button>
                </div>`;
        }
    }

    refresh() { this.loadWarnings(); }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.WeatherWidget = WeatherWidget;
    WeatherWidget.instance = null;
}
