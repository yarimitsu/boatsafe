/**
 * Discussion Widget - Area Forecast Discussion
 */
class Discussion {
    constructor() {
        this.container = document.getElementById('discussion');
        this.content = this.container.querySelector('.discussion-content');
        this.currentData = null;
        
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
     * Render the discussion
     */
    render() {
        if (!this.currentData) {
            this.showLoading();
            return;
        }

        const { office, text, issued } = this.currentData;
        
        if (!text) {
            this.showError('No discussion available');
            return;
        }

        const html = `
            <div class="discussion-header">
                <div class="discussion-office">${office} Forecast Office</div>
                <div class="discussion-issued">${this.formatDate(issued)}</div>
            </div>
            <div class="discussion-text">${this.formatText(text)}</div>
        `;

        this.content.innerHTML = html;
    }

    /**
     * Format discussion text
     * @param {string} text - Raw text
     * @returns {string} Formatted text
     */
    formatText(text) {
        if (!text) return '';
        
        // Basic formatting for AFD text
        return text
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>')
            .replace(/^(.+)$/, '<p>$1</p>');
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