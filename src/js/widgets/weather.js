/**
 * Weather Warnings Widget
 * Displays weather warnings and advisories from NOAA Juneau office
 */
class WeatherWidget {
    constructor() {
        this.container = document.getElementById('weather');
        this.content = this.container.querySelector('.weather-content');
        this.toggleButton = document.getElementById('weather-toggle');
        this.currentData = null;
        this.isExpanded = true; // Default to expanded
        
        this.init();
    }

    /**
     * Initialize the widget
     */
    init() {
        this.setupToggleButton();
        this.showLoading();
        this.loadWarnings();
        
        // Auto-refresh every 15 minutes
        setInterval(() => {
            this.loadWarnings();
        }, 15 * 60 * 1000);
    }

    /**
     * Setup toggle button functionality
     */
    setupToggleButton() {
        if (!this.toggleButton) return;
        
        this.toggleButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleWidget();
        });
    }

    /**
     * Toggle widget visibility
     */
    toggleWidget() {
        if (this.isExpanded) {
            this.collapseWidget();
        } else {
            this.expandWidget();
        }
    }

    /**
     * Expand widget content
     */
    expandWidget() {
        this.content.style.display = 'block';
        this.content.classList.add('expanding');
        this.isExpanded = true;
        
        this.toggleButton.setAttribute('aria-expanded', 'true');
        this.toggleButton.querySelector('.chevron-icon').classList.add('expanded');
        
        setTimeout(() => {
            this.content.classList.remove('expanding');
        }, 300);
    }

    /**
     * Collapse widget content
     */
    collapseWidget() {
        this.content.classList.add('collapsing');
        this.isExpanded = false;
        
        this.toggleButton.setAttribute('aria-expanded', 'false');
        this.toggleButton.querySelector('.chevron-icon').classList.remove('expanded');
        
        setTimeout(() => {
            this.content.style.display = 'none';
            this.content.classList.remove('collapsing');
        }, 300);
    }

    /**
     * Load active alerts directly from api.weather.gov (CORS-enabled, no proxy).
     */
    async loadWarnings() {
        try {
            const res = await window.BoatSafe.http.get(
                'https://api.weather.gov/alerts/active?area=AK', { cacheTTL: 10 });
            // api.weather.gov sends application/geo+json, which the http util
            // returns as a string (its content-type check misses "geo+")
            const data = typeof res === 'string' ? JSON.parse(res) : res;
            this.currentData = Array.isArray(data.features) ? data.features : [];
            this.renderWarnings();
        } catch (error) {
            console.error('Failed to load weather alerts:', error);
            this.showError(`Failed to load weather alerts: ${error.message}`);
        }
    }

    /**
     * Render active alerts as cards, most severe first.
     */
    renderWarnings() {
        const alerts = this.currentData || [];
        const headerHtml = `
            <div class="warnings-header">
                <div class="office-info">
                    <strong>Alaska — Active Warnings &amp; Advisories</strong>
                    <div class="warning-meta">
                        <span class="last-updated">${alerts.length} active · checked ${this.formatDate(new Date())}</span>
                        <a href="https://www.weather.gov/safety" target="_blank" rel="noopener" class="noaa-link">NOAA alerts →</a>
                    </div>
                </div>
            </div>
        `;

        if (alerts.length === 0) {
            this.content.innerHTML = headerHtml +
                '<div class="status-message status-info">No active warnings or advisories for Alaska.</div>';
            return;
        }

        const rank = WeatherWidget.SEVERITY_RANK;
        const sorted = [...alerts].sort((a, b) => {
            const bySeverity = (rank[b.properties.severity] || 0) - (rank[a.properties.severity] || 0);
            if (bySeverity) return bySeverity;
            return new Date(b.properties.effective || 0) - new Date(a.properties.effective || 0);
        });

        this.content.innerHTML = headerHtml +
            '<div class="warnings-grid">' + sorted.map(a => this.renderWarningBox(a)).join('') + '</div>';
    }

    /**
     * Render a single alert card from an api.weather.gov alert feature.
     */
    renderWarningBox(feature) {
        const p = feature.properties || {};
        const esc = WeatherWidget.escapeHtml;
        const sev = p.severity || 'Unknown';
        const sevClass = 'severity-' + sev.toLowerCase();

        const desc = p.description ? esc(p.description).replace(/\n/g, '<br>') : '';
        const instruction = p.instruction ? esc(p.instruction).replace(/\n/g, '<br>') : '';
        const body = desc + (instruction
            ? `<br><br><strong>Precautionary/preparedness actions:</strong><br>${instruction}` : '');

        const effectiveWindow = (p.effective && p.expires)
            ? `${this.formatDate(new Date(p.effective))} – ${this.formatDate(new Date(p.expires))}`
            : '';

        return `
            <div class="warning-box active ${sevClass}">
                <div class="warning-header">
                    <div class="warning-title">
                        <strong>${esc(p.event || 'Weather Alert')}</strong>
                    </div>
                    <div class="warning-status ${sevClass}">${esc(sev)}</div>
                </div>
                ${p.areaDesc ? `<div class="warning-summary">${esc(p.areaDesc)}</div>` : ''}
                ${effectiveWindow ? `<div class="warning-timestamp"><strong>In effect:</strong> ${effectiveWindow}</div>` : ''}
                <div class="warning-content expandable">
                    <div class="content-text">${body || 'No further detail provided.'}</div>
                    <button class="expand-btn" onclick="this.parentElement.classList.toggle('expanded'); this.setAttribute('aria-expanded', this.parentElement.classList.contains('expanded'))">
                        <span class="expand-text">Show Full Text</span>
                        <span class="collapse-text">Show Less</span>
                    </button>
                </div>
            </div>
        `;
    }

    static SEVERITY_RANK = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1, Unknown: 0 };

    static escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    /**
     * Format warning content for display
     * @param {string} content - Raw warning content
     * @returns {string} Formatted content
     */
    formatWarningContent(content) {
        if (!content) return 'No content available';
        
        // Clean up the content
        let formatted = content
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        
        // Convert to HTML with proper line breaks
        formatted = formatted
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join('<br>');
        
        return formatted;
    }

    /**
     * Extract warning summary from content
     * @param {string} content - Warning content
     * @returns {string|null} Summary text
     */
    extractWarningSummary(content) {
        if (!content) return null;
        
        // Look for common warning patterns
        const summaryPatterns = [
            /URGENT - WEATHER MESSAGE/i,
            /\.\.\.([^.]+ADVISORY[^.]*)\.\.\./i,
            /\.\.\.([^.]+WARNING[^.]*)\.\.\./i,
            /\.\.\.([^.]+WATCH[^.]*)\.\.\./i,
            /WHAT\.\.\.([^.]+)/i,
            /WHERE\.\.\.([^.]+)/i,
            /WHEN\.\.\.([^.]+)/i
        ];
        
        for (const pattern of summaryPatterns) {
            const match = content.match(pattern);
            if (match) {
                let summary = match[1] || match[0];
                // Clean up and limit length
                summary = summary.replace(/\s+/g, ' ').trim();
                if (summary.length > 150) {
                    summary = summary.substring(0, 147) + '...';
                }
                return summary;
            }
        }
        
        // Fallback: use first meaningful line
        const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 10);
        if (lines.length > 0) {
            let summary = lines[0];
            if (summary.length > 150) {
                summary = summary.substring(0, 147) + '...';
            }
            return summary;
        }
        
        return null;
    }

    /**
     * Format date for display
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
                minute: '2-digit',
                timeZoneName: 'short'
            });
        } catch (error) {
            return 'Unknown';
        }
    }

    /**
     * Show loading state
     * @param {string} message - Loading message
     */
    showLoading(message = 'Loading weather warnings...') {
        this.content.innerHTML = `<div class="loading">${message}</div>`;
    }

    /**
     * Show error state
     * @param {string} message - Error message
     */
    showError(message) {
        this.content.innerHTML = `
            <div class="status-message status-error">
                <strong>Error:</strong> ${message}
                <br><br>
                <button onclick="window.WeatherWidget.instance.loadWarnings()" class="retry-btn">
                    Retry Loading
                </button>
            </div>
        `;
    }

    /**
     * Show local development message
     */
    showLocalDevelopmentMessage() {
        this.content.innerHTML = `
            <div class="status-message status-info">
                <strong>Local Development Mode</strong>
                <p>Weather warnings will be displayed when deployed to production.</p>
                <p>The widget will show boxes for:</p>
                <ul>
                    <li>Non-Precipitation Warnings</li>
                    <li>Winter Storm Warnings</li>
                    <li>Weather Conditions</li>
                    <li>Special Weather Statements</li>
                    <li>Hazardous Weather Outlook</li>
                    <li>Area Forecast Discussion</li>
                </ul>
            </div>
        `;
    }

    /**
     * Clear widget content
     */
    clear() {
        this.currentData = null;
        this.showLoading('Loading weather warnings...');
    }

    /**
     * Get current warnings data
     * @returns {Object|null} Current warnings data
     */
    getData() {
        return this.currentData;
    }

    /**
     * Export warnings data as text
     * @returns {string} Text representation
     */
    exportAsText() {
        if (!this.currentData) return '';
        
        const { warnings, updated, officeName } = this.currentData;
        
        let text = `Weather Warnings from ${officeName}\n`;
        text += `Updated: ${this.formatDate(new Date(updated))}\n\n`;
        
        Object.entries(warnings).forEach(([code, warning]) => {
            text += `${warning.name} (${code}):\n`;
            if (warning.timestamp) {
                text += `Issued: ${warning.timestamp}\n`;
            }
            text += `${warning.content}\n\n`;
            text += '---\n\n';
        });
        
        return text;
    }

    /**
     * Refresh warnings
     */
    refresh() {
        this.loadWarnings();
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.WeatherWidget = WeatherWidget;
    // Store instance for retry button
    WeatherWidget.instance = null;
}
