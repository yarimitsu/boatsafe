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
    init() {
        this.showLoading();
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
     * @param {string} office - Forecast office code
     */
    async loadDiscussion(office) {
        if (!office) {
            this.showError('No forecast office specified');
            return;
        }

        this.currentOffice = office;
        this.showLoading();

        try {
            // Use the new Netlify proxy function
            const currentHost = window.location.origin;
            const proxyUrl = `${currentHost}/.netlify/functions/forecast-discussion/${office.toUpperCase()}`;
            
            console.log(`Fetching forecast discussion via proxy: ${proxyUrl}`);
            
            const response = await fetch(proxyUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('Received forecast discussion data:', data);
            
            this.currentData = data;
            this.render();
        } catch (error) {
            console.error('Failed to load forecast discussion:', error);
            this.showError('Unable to load forecast discussion');
        }
    }

    /**
     * Render the discussion
     */
    render() {
        if (!this.currentData) {
            this.showLoading();
            return;
        }

        const { office, text, issued, source } = this.currentData;
        
        if (!text || text.trim().length === 0) {
            this.showError('No discussion available');
            return;
        }

        const html = `
            <div class="discussion-header">
                <div class="discussion-office">${office} Forecast Office</div>
                <div class="discussion-issued">${this.formatDate(issued)}</div>
                ${source ? `<div class="discussion-source">${source}</div>` : ''}
            </div>
            <div class="discussion-text">${this.formatText(text)}</div>
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