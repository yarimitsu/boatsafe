/**
 * Alerts Widget - Marine Weather Alerts
 */
class Alerts {
    constructor() {
        this.container = document.getElementById('alerts');
        this.content = this.container.querySelector('.alerts-content');
        this.currentData = null;
        
        this.init();
    }

    /**
     * Initialize the widget
     */
    init() {
        this.showNoAlerts();
    }

    /**
     * Update widget with alerts data
     * @param {Object} data - Marine alerts data
     */
    update(data) {
        this.currentData = data;
        this.render();
    }

    /**
     * Render the alerts
     */
    render() {
        if (!this.currentData || !this.currentData.alerts || this.currentData.alerts.length === 0) {
            this.showNoAlerts();
            return;
        }

        const alerts = this.currentData.alerts;
        const html = alerts.map(alert => this.renderAlert(alert)).join('');
        
        // Add source information at the bottom
        const sourceInfo = this.renderSourceInfo(this.currentData.sources);
        this.content.innerHTML = html + sourceInfo;
    }

    /**
     * Check if alert is marine-related (legacy function, now all alerts are marine)
     * @param {Object} properties - Alert properties
     * @returns {boolean} Whether alert is marine-related
     */
    isMarineAlert(properties) {
        // All alerts from marine-alerts function are marine-related
        return true;
    }

    /**
     * Render individual alert
     * @param {Object} alert - Marine alert object
     * @returns {string} HTML string
     */
    renderAlert(alert) {
        const { headline, type, severity, areas, description, issued, expires, source } = alert;
        
        return `
            <div class="alert-item ${this.getAlertClass(severity)}">
                <div class="alert-header">
                    <div class="alert-title">${headline || type}</div>
                    <div class="alert-severity">${severity}</div>
                </div>
                <div class="alert-source">
                    <small>Source: ${source}</small>
                </div>
                ${areas && areas.length > 0 ? `
                <div class="alert-areas">
                    <strong>Areas:</strong> ${areas.join(', ')}
                </div>
                ` : ''}
                <div class="alert-time">
                    ${this.formatMarineAlertTime(issued, expires)}
                </div>
                <div class="alert-description">
                    ${this.formatDescription(description)}
                </div>
            </div>
        `;
    }

    /**
     * Get CSS class for alert severity
     * @param {string} severity - Alert severity
     * @returns {string} CSS class
     */
    getAlertClass(severity) {
        switch (severity?.toLowerCase()) {
            case 'extreme':
                return 'emergency';
            case 'severe':
                return 'warning';
            case 'moderate':
                return 'watch';
            case 'minor':
                return 'advisory';
            default:
                return 'advisory';
        }
    }

    /**
     * Format marine alert time information
     * @param {string} issued - Issued time text
     * @param {string} expires - Expiration time text
     * @returns {string} Formatted time string
     */
    formatMarineAlertTime(issued, expires) {
        let timeStr = '';
        
        if (issued) {
            timeStr += `Issued: ${issued}`;
        }
        
        if (expires) {
            if (timeStr) timeStr += ' • ';
            timeStr += `${expires}`;
        }
        
        return timeStr || 'Time not specified';
    }

    /**
     * Format alert time information (legacy function)
     * @param {string} onset - Onset time
     * @param {string} expires - Expiration time
     * @returns {string} Formatted time string
     */
    formatAlertTime(onset, expires) {
        const now = new Date();
        let timeStr = '';
        
        if (onset) {
            const onsetDate = new Date(onset);
            if (onsetDate > now) {
                timeStr += `Begins: ${this.formatDate(onsetDate)}`;
            } else {
                timeStr += `Active since: ${this.formatDate(onsetDate)}`;
            }
        }
        
        if (expires) {
            const expiresDate = new Date(expires);
            if (timeStr) timeStr += ' • ';
            timeStr += `Expires: ${this.formatDate(expiresDate)}`;
        }
        
        return timeStr || 'Time not specified';
    }

    /**
     * Format alert description
     * @param {string} description - Raw description
     * @returns {string} Formatted description
     */
    formatDescription(description) {
        if (!description) return '';
        
        // Convert line breaks to HTML breaks
        let formatted = description.replace(/\n/g, '<br>');
        
        // Truncate very long descriptions
        if (formatted.length > 600) {
            formatted = formatted.substring(0, 600) + '...';
        }
        
        return formatted;
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
                minute: '2-digit'
            });
        } catch (error) {
            return 'Unknown';
        }
    }

    /**
     * Show no alerts state
     */
    showNoAlerts() {
        this.content.innerHTML = '<div class="no-alerts">No active marine alerts</div>';
    }

    /**
     * Show loading state
     */
    showLoading() {
        this.content.innerHTML = '<div class="loading">Loading alerts...</div>';
    }

    /**
     * Show error state
     * @param {string} message - Error message
     */
    showError(message) {
        this.content.innerHTML = `
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
        this.showNoAlerts();
    }

    /**
     * Render source information
     * @param {Array} sources - Array of source information
     * @returns {string} HTML string for source info
     */
    renderSourceInfo(sources) {
        if (!sources || sources.length === 0) return '';
        
        return `
            <div class="alert-sources">
                <div class="source-title">Data Sources:</div>
                ${sources.map(source => `
                    <div class="source-item ${source.status}">
                        <span class="source-name">${source.name}</span>
                        <span class="source-status">${source.status}</span>
                        ${source.error ? `<span class="source-error">${source.error}</span>` : ''}
                    </div>
                `).join('')}
                <div class="source-updated">
                    <small>Last updated: ${this.formatDate(new Date())}</small>
                </div>
            </div>
        `;
    }

    /**
     * Get active alerts count
     * @returns {number} Number of active alerts
     */
    getActiveCount() {
        if (!this.currentData || !this.currentData.alerts) return 0;
        
        return this.currentData.alerts.length;
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Alerts = Alerts;
}