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
        
        // Clean unwanted content first
        let cleanedText = text
            // Remove USA.gov references and associated bullet points
            .replace(/usa\.gov[^\n]*/gi, '')
            // Remove bullet points that often appear after usa.gov references
            .replace(/^\s*[•·\-\*]\s*[^\n]*$/gm, '')
            // Remove any remaining bullet-like patterns
            .replace(/\s*[•·▪▫]\s*/g, ' ')
            // Remove excessive whitespace and normalize line breaks
            .replace(/\s+/g, ' ')
            .replace(/\n\s*\n/g, '\n\n')
            .trim();

        // Smart paragraph breaking for meteorological discussions
        let paragraphs = [];
        
        // First try splitting on double line breaks
        let initialSplit = cleanedText.split(/\n\n+/);
        
        if (initialSplit.length === 1) {
            // No double line breaks found, use intelligent breaking
            let sentences = cleanedText.split(/\.\s+/);
            let currentParagraph = '';
            
            for (let i = 0; i < sentences.length; i++) {
                let sentence = sentences[i].trim();
                if (!sentence) continue;
                
                // Add period back unless it's the last sentence
                if (i < sentences.length - 1) {
                    sentence += '.';
                }
                
                // Start new paragraph on certain meteorological keywords
                if (this.shouldStartNewParagraph(sentence, currentParagraph)) {
                    if (currentParagraph.trim()) {
                        paragraphs.push(currentParagraph.trim());
                    }
                    currentParagraph = sentence;
                } else {
                    currentParagraph += (currentParagraph ? ' ' : '') + sentence;
                }
                
                // Break long paragraphs (more than 4 sentences)
                if (currentParagraph.split(/\.\s+/).length >= 4) {
                    paragraphs.push(currentParagraph.trim());
                    currentParagraph = '';
                }
            }
            
            // Add remaining content
            if (currentParagraph.trim()) {
                paragraphs.push(currentParagraph.trim());
            }
        } else {
            // Use existing double line break splits but clean them
            paragraphs = initialSplit
                .map(p => p.trim())
                .filter(p => p.length > 10); // Filter out very short fragments
        }
        
        // Format paragraphs with proper HTML
        let formatted = paragraphs
            .map(paragraph => {
                // Further break very long paragraphs at sentence boundaries
                if (paragraph.length > 800) {
                    return this.breakLongParagraph(paragraph);
                }
                return `<p>${paragraph}</p>`;
            })
            .join('');
        
        // Fallback for edge cases
        if (!formatted || paragraphs.length === 0) {
            formatted = `<p>${cleanedText.replace(/\n/g, '<br>')}</p>`;
        }
        
        // Enhance formatting with weather terminology
        formatted = formatted
            // Highlight time periods
            .replace(/\b(TODAY|TONIGHT|TOMORROW|THIS EVENING|THIS MORNING|THIS AFTERNOON|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY)\b/gi, '<strong>$1</strong>')
            // Highlight weather systems and patterns
            .replace(/\b(LOW PRESSURE|HIGH PRESSURE|FRONT|TROUGH|RIDGE|STORM SYSTEM|WEATHER SYSTEM)\b/gi, '<strong>$1</strong>')
            // Highlight weather conditions
            .replace(/\b(RAIN|SNOW|THUNDERSTORMS|FOG|WIND|GALE|STORM|CLEAR|CLOUDY|PARTLY CLOUDY|OVERCAST|SHOWERS|DRIZZLE)\b/gi, '<em>$1</em>')
            // Highlight marine conditions  
            .replace(/\b(SEAS|WAVES|SWELL|CHOPPY|ROUGH|CALM|SURF|BREAKERS)\b/gi, '<em>$1</em>')
            // Format wind directions with better styling
            .replace(/\b([NSEW]|NE|NW|SE|SW|NORTH|SOUTH|EAST|WEST|NORTHEAST|NORTHWEST|SOUTHEAST|SOUTHWEST)\b/gi, '<span class="wind-direction">$1</span>')
            // Highlight wind speeds and weather measurements
            .replace(/\b(\d+\s*(?:MPH|KT|KNOTS?|FT|FEET|INCHES?|IN))\b/gi, '<span class="weather-measurement">$1</span>');
        
        return formatted;
    }

    /**
     * Determine if a new paragraph should be started based on content
     * @param {string} sentence - Current sentence
     * @param {string} currentParagraph - Current paragraph content
     * @returns {boolean} Whether to start a new paragraph
     */
    shouldStartNewParagraph(sentence, currentParagraph) {
        if (!currentParagraph) return false;
        
        // Keywords that typically start new discussion sections
        const newSectionKeywords = [
            'SYNOPSIS', 'DISCUSSION', 'TONIGHT', 'TOMORROW', 'SUNDAY', 'MONDAY', 
            'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY',
            'MARINE', 'AVIATION', 'FIRE WEATHER', 'SHORT TERM', 'LONG TERM',
            'NEAR TERM', 'EXTENDED'
        ];
        
        const upperSentence = sentence.toUpperCase();
        return newSectionKeywords.some(keyword => 
            upperSentence.startsWith(keyword) || 
            upperSentence.startsWith(keyword + '...')
        );
    }

    /**
     * Break long paragraphs into smaller, more readable chunks
     * @param {string} paragraph - Long paragraph to break
     * @returns {string} HTML with multiple paragraphs
     */
    breakLongParagraph(paragraph) {
        const sentences = paragraph.split(/\.\s+/);
        const chunks = [];
        let currentChunk = '';
        
        for (let i = 0; i < sentences.length; i++) {
            let sentence = sentences[i].trim();
            if (!sentence) continue;
            
            // Add period back unless it's the last sentence
            if (i < sentences.length - 1) {
                sentence += '.';
            }
            
            if (currentChunk && (currentChunk + ' ' + sentence).length > 400) {
                chunks.push(currentChunk.trim());
                currentChunk = sentence;
            } else {
                currentChunk += (currentChunk ? ' ' : '') + sentence;
            }
        }
        
        if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }
        
        return chunks.map(chunk => `<p>${chunk}</p>`).join('');
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