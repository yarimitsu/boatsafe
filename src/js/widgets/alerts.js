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
    async init() {
        this.showLoading();
        await this.loadAlerts();
    }

    /**
     * Load marine alerts data
     */
    async loadAlerts() {
        try {
            const currentHost = window.location.origin;
            const isLocal = currentHost.includes('localhost') || currentHost.includes('127.0.0.1');
            
            if (isLocal) {
                // Local development - show placeholder
                this.showLocalDevPlaceholder();
            } else {
                // Production - fetch real data via Netlify function
                const proxyUrl = `${currentHost}/.netlify/functions/marine-alerts`;
                console.log('Fetching marine alerts from:', proxyUrl);
                const data = await window.BoatSafe.http.get(proxyUrl, { cacheTTL: 5 });
                console.log('Received marine alerts data:', data);
                this.currentData = data;
                this.render();
            }
        } catch (error) {
            console.error('Failed to load marine alerts:', error);
            this.showError('Unable to load marine alerts');
        }
    }

    /**
     * Show local development placeholder
     */
    showLocalDevPlaceholder() {
        this.content.innerHTML = `
            <div class="alert-item advisory">
                <div class="alert-header">
                    <div class="alert-title">Local Development Mode</div>
                    <div class="alert-severity">INFO</div>
                </div>
                <div class="alert-description">
                    Deploy to Netlify to see real marine alerts and warnings.
                    <br><br>
                    This widget will display current marine alerts, warnings, and advisories for Alaska waters.
                </div>
            </div>
        `;
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
        const alertsHtml = alerts.map(alert => this.renderAlert(alert)).join('');
        
        // Add header with update time in upper right
        const headerHtml = `
            <div class="alerts-header">
                <div class="alerts-title">
                    <strong>Marine Alerts</strong>
                    <span class="alert-count">${alerts.length} active</span>
                </div>
                <div class="alerts-updated">
                    <span class="period-time">Updated: ${this.currentData.issuedTime || this.formatDate(new Date(this.currentData.timestamp))}</span>
                </div>
            </div>
        `;
        
        this.content.innerHTML = headerHtml + alertsHtml;
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
        const { type, severity, text, effectiveTime, expirationTime, source, headline, areas } = alert;
        
        // Format times for display
        const effectiveDisplay = effectiveTime ? this.formatDate(new Date(effectiveTime)) : null;
        const expirationDisplay = expirationTime ? this.formatDate(new Date(expirationTime)) : null;
        
        return `
            <div class="forecast-period alert-${severity}">
                <div class="period-header">
                    <div class="alert-title-section">
                        <strong>${type}</strong>
                        ${areas ? `<span class="alert-areas">${areas}</span>` : ''}
                        <span class="alert-source">${source}</span>
                    </div>
                    <div class="alert-severity-badge">
                        <span class="severity-${severity}">${severity.toUpperCase()}</span>
                    </div>
                </div>
                ${headline ? `<div class="alert-headline">${headline}</div>` : ''}
                <div class="forecast-text alert-text">
                    ${this.formatAlertText(text)}
                </div>
                ${effectiveDisplay || expirationDisplay ? `
                <div class="alert-time">
                    ${effectiveDisplay ? `Effective: ${effectiveDisplay}` : ''}
                    ${effectiveDisplay && expirationDisplay ? ' | ' : ''}
                    ${expirationDisplay ? `Until: ${expirationDisplay}` : ''}
                </div>
                ` : ''}
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
     * Format alert text for display
     * @param {string} text - Raw alert text
     * @returns {string} Formatted text
     */
    formatAlertText(text) {
        if (!text) return 'No details available';
        
        // Clean up and format the text
        return text
            .replace(/\s+/g, ' ')  // Normalize whitespace
            .trim()
            .substring(0, 500) + (text.length > 500 ? '...' : '');
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
        const headerHtml = `
            <div class="alerts-header">
                <div class="alerts-title">
                    <strong>Marine Alerts</strong>
                </div>
                <div class="alerts-updated">
                    <span class="period-time">Updated: ${this.formatDate(new Date())}</span>
                </div>
            </div>
        `;
        
        this.content.innerHTML = headerHtml + '<div class="no-alerts">No active marine alerts</div>';
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