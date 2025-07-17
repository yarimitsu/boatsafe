/**
 * Discussion Widget - Area Forecast Discussion
 */
class Discussion {
    constructor() {
        this.container = document.getElementById('discussion');
        this.content = this.container.querySelector('.discussion-content');
        this.currentData = null;
        this.currentOffice = null;
        
        this.init();
    }

    /**
     * Initialize the widget
     */
    async init() {
        this.showLoading();
        await this.loadDiscussion();
    }

    /**
     * Update widget with discussion data
     * @param {Object} data - Discussion data
     */
    update(data) {
        this.currentData = data;
        this.render();
    }

    /**
     * Load discussion for a specific office
     * @param {string} office - Forecast office code (optional, defaults to AJK)
     */
    async loadDiscussion(office = 'AJK') {
        this.currentOffice = office;
        this.showLoading();

        try {
            const currentHost = window.location.origin;
            const isLocal = currentHost.includes('localhost') || currentHost.includes('127.0.0.1');
            
            if (isLocal) {
                // Local development - show placeholder
                this.showLocalDevPlaceholder();
            } else {
                // Production - fetch real data via Netlify function
                const proxyUrl = `${currentHost}/.netlify/functions/forecast-discussion`;
                console.log('Fetching forecast discussion from:', proxyUrl);
                const data = await window.BoatSafe.http.get(proxyUrl, { cacheTTL: 30 });
                console.log('Received forecast discussion data:', data);
                this.currentData = data;
                this.render();
            }
        } catch (error) {
            console.error('Failed to load forecast discussion:', error);
            this.showError('Unable to load forecast discussion');
        }
    }

    /**
     * Show local development placeholder
     */
    showLocalDevPlaceholder() {
        this.content.innerHTML = `
            <div class="forecast-period">
                <div class="period-header">
                    <strong>Forecast Discussion</strong>
                    <span class="period-time">Local Development Mode</span>
                </div>
                <div class="forecast-text">
                    Deploy to Netlify to see the real Area Forecast Discussion from meteorologists.
                    <br><br>
                    This widget displays technical meteorological analysis and reasoning behind the forecast.
                </div>
            </div>
        `;
    }

    /**
     * Render the discussion
     */
    render() {
        if (!this.currentData || !this.currentData.properties) {
            this.showLoading();
            return;
        }

        const { properties } = this.currentData;
        const { office, officeName, text, updated, issuedTime } = properties;
        
        if (!text || text.trim().length === 0) {
            this.showError('No discussion available');
            return;
        }

        const html = `
            <div class="forecast-period">
                <div class="period-header">
                    <strong>Forecast Discussion - ${officeName || office}</strong>
                    <span class="period-time">${issuedTime || this.formatDate(new Date(updated))}</span>
                </div>
                <div class="forecast-text">
                    ${this.formatText(text)}
                </div>
            </div>
        `;

        this.content.innerHTML = html;
    }

    /**
     * Format discussion text for better readability
     * @param {string} text - Raw text
     * @returns {string} Formatted text
     */
    formatText(text) {
        if (!text) return '';
        
        // Clean and format AFD text
        let formatted = text
            // Remove excessive whitespace
            .replace(/\s+/g, ' ')
            // Split into paragraphs on double line breaks
            .split('\n\n')
            .map(paragraph => paragraph.trim())
            .filter(paragraph => paragraph.length > 0)
            // Wrap each paragraph in <p> tags
            .map(paragraph => `<p>${paragraph}</p>`)
            .join('');
        
        // If no paragraphs were created, treat as single block
        if (!formatted.includes('<p>')) {
            formatted = `<p>${text.replace(/\n/g, '<br>')}</p>`;
        }
        
        // Enhance formatting with weather terminology
        formatted = formatted
            // Highlight time periods
            .replace(/\b(TODAY|TONIGHT|TOMORROW|THIS EVENING|THIS MORNING|THIS AFTERNOON)\b/gi, '<strong>$1</strong>')
            // Highlight weather conditions
            .replace(/\b(RAIN|SNOW|THUNDERSTORMS|FOG|WIND|GALE|STORM|CLEAR|CLOUDY|PARTLY CLOUDY)\b/gi, '<em>$1</em>')
            // Highlight marine conditions  
            .replace(/\b(SEAS|WAVES|SWELL|CHOPPY|ROUGH|CALM)\b/gi, '<em>$1</em>')
            // Format wind directions
            .replace(/\b([NSEW]|NE|NW|SE|SW|NORTH|SOUTH|EAST|WEST|NORTHEAST|NORTHWEST|SOUTHEAST|SOUTHWEST)\b/gi, '<span class="wind-direction">$1</span>');
        
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
     * Show loading state
     */
    showLoading() {
        this.content.innerHTML = '<div class="loading">Loading discussion...</div>';
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
        this.content.innerHTML = '<div class="loading">Loading discussion...</div>';
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Discussion = Discussion;
}