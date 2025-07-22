/**
 * Weather Warnings Widget
 * Displays weather warnings and advisories from NOAA Juneau office
 */
class WeatherWidget {
    constructor() {
        this.container = document.getElementById('weather');
        this.content = this.container.querySelector('.weather-content');
        this.currentData = null;
        
        this.init();
    }

    /**
     * Initialize the widget
     */
    init() {
        this.showLoading();
        this.loadWarnings();
        
        // Auto-refresh every 15 minutes
        setInterval(() => {
            this.loadWarnings();
        }, 15 * 60 * 1000);
    }

    /**
     * Load weather warnings from Netlify function
     */
    async loadWarnings() {
        try {
            const currentHost = window.location.origin;
            const isLocal = currentHost.includes('localhost') || currentHost.includes('127.0.0.1');
            
            if (isLocal) {
                // Local development - show placeholder
                this.showLocalDevelopmentMessage();
                return;
            }

            // Production - use Netlify function
            const proxyUrl = `${currentHost}/.netlify/functions/weather-forecast`;
            console.log('Fetching weather warnings from:', proxyUrl);
            
            const data = await window.BoatSafe.http.get(proxyUrl, { cacheTTL: 15 }); // 15 minutes cache
            
            console.log('Received weather warnings data:', data);
            console.log('Data structure:', {
                hasWarnings: !!data.warnings,
                warningsKeys: data.warnings ? Object.keys(data.warnings) : [],
                warningsCount: data.warnings ? Object.keys(data.warnings).length : 0,
                officeName: data.officeName,
                updated: data.updated
            });
            
            if (data.warnings) {
                this.currentData = data;
                this.renderWarnings();
            } else {
                console.error('Invalid response structure:', data);
                throw new Error('No warnings data received - invalid response structure');
            }
        } catch (error) {
            console.error('Failed to load weather warnings:', error);
            this.showError(`Failed to load weather warnings: ${error.message}`);
        }
    }

    /**
     * Render weather warnings in separate boxes
     */
    renderWarnings() {
        if (!this.currentData || !this.currentData.warnings) {
            this.showError('No weather warnings data available');
            return;
        }

        const { warnings, updated, officeName } = this.currentData;
        
        // Check if all warnings are empty/inactive
        const activeWarnings = Object.values(warnings).filter(warning => warning.hasContent);
        console.log(`Rendering ${Object.keys(warnings).length} total warnings, ${activeWarnings.length} active`);
        
        if (activeWarnings.length === 0) {
            console.log('No active warnings to display');
        }
        
        // Create header
        const headerHtml = `
            <div class="warnings-header">
                <div class="office-info">
                    <strong>${officeName}</strong>
                    <span class="last-updated">Last updated: ${this.formatDate(new Date(updated))}</span>
                </div>
                <div class="refresh-info">
                    <small>Auto-refreshes every 15 minutes</small>
                </div>
            </div>
        `;

        // Create warning boxes
        const warningBoxes = Object.entries(warnings).map(([code, warning]) => {
            return this.renderWarningBox(code, warning);
        }).join('');

        const html = headerHtml + '<div class="warnings-grid">' + warningBoxes + '</div>';
        
        this.content.innerHTML = html;
    }

    /**
     * Render individual warning box
     * @param {string} code - Warning code (NPW, WSW, etc.)
     * @param {Object} warning - Warning data
     * @returns {string} HTML string
     */
    renderWarningBox(code, warning) {
        const { name, content, timestamp, hasContent } = warning;
        
        // Determine box status
        const status = hasContent ? 'active' : 'inactive';
        const statusText = hasContent ? 'ACTIVE' : 'No current warnings';
        
        // Clean and format content
        const displayContent = hasContent ? this.formatWarningContent(content) : `No ${name.toLowerCase()} currently active.`;
        
        // Extract key information for summary
        const summary = hasContent ? this.extractWarningSummary(content) : null;
        
        return `
            <div class="warning-box ${status}">
                <div class="warning-header">
                    <div class="warning-title">
                        <strong>${name}</strong>
                        <span class="warning-code">${code}</span>
                    </div>
                    <div class="warning-status ${status}">
                        ${statusText}
                    </div>
                </div>
                
                ${timestamp ? `
                    <div class="warning-timestamp">
                        <strong>Issued:</strong> ${timestamp}
                    </div>
                ` : ''}
                
                ${summary ? `
                    <div class="warning-summary">
                        ${summary}
                    </div>
                ` : ''}
                
                <div class="warning-content ${hasContent ? 'expandable' : ''}">
                    <div class="content-text">
                        ${displayContent}
                    </div>
                    ${hasContent ? `
                        <button class="expand-btn" onclick="this.parentElement.classList.toggle('expanded'); this.setAttribute('aria-expanded', this.parentElement.classList.contains('expanded'))">
                            <span class="expand-text">Show Full Text</span>
                            <span class="collapse-text">Show Less</span>
                        </button>
                    ` : ''}
                </div>
                
                <div class="warning-link">
                    <a href="https://forecast.weather.gov/product.php?site=NWS&issuedby=AJK&product=${code}&format=txt&version=1&glossary=0" 
                       target="_blank" rel="noopener">
                        View on NOAA Website →
                    </a>
                </div>
            </div>
        `;
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
                    <li>Short Term Forecast</li>
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
