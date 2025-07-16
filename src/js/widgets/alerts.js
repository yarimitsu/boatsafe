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
     * @param {Object} data - Alerts data
     */
    update(data) {
        this.currentData = data;
        this.render();
    }

    /**
     * Render the alerts
     */
    render() {
        if (!this.currentData || !this.currentData.features || this.currentData.features.length === 0) {
            this.showNoAlerts();
            return;
        }

        const marineAlerts = this.currentData.features.filter(alert => 
            this.isMarineAlert(alert.properties)
        );

        if (marineAlerts.length === 0) {
            this.showNoAlerts();
            return;
        }

        const html = marineAlerts.map(alert => this.renderAlert(alert.properties)).join('');
        this.content.innerHTML = html;
    }

    /**
     * Check if alert is marine-related
     * @param {Object} properties - Alert properties
     * @returns {boolean} Whether alert is marine-related
     */
    isMarineAlert(properties) {
        const marineKeywords = ['marine', 'coastal', 'wind', 'wave', 'surf', 'tide', 'storm'];
        const text = (properties.headline + ' ' + properties.event).toLowerCase();
        
        return marineKeywords.some(keyword => text.includes(keyword));
    }

    /**
     * Render individual alert
     * @param {Object} properties - Alert properties
     * @returns {string} HTML string
     */
    renderAlert(properties) {
        const { headline, event, severity, urgency, onset, expires, description } = properties;
        
        return `
            <div class="alert-item ${this.getAlertClass(severity)}">
                <div class="alert-header">
                    <div class="alert-title">${headline || event}</div>
                    <div class="alert-severity">${severity}</div>
                </div>
                <div class="alert-time">
                    ${this.formatAlertTime(onset, expires)}
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
     * Format alert time information
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
        
        // Truncate long descriptions
        if (description.length > 300) {
            return description.substring(0, 300) + '...';
        }
        
        return description;
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
     * Get active alerts count
     * @returns {number} Number of active alerts
     */
    getActiveCount() {
        if (!this.currentData || !this.currentData.features) return 0;
        
        return this.currentData.features.filter(alert => 
            this.isMarineAlert(alert.properties)
        ).length;
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Alerts = Alerts;
}