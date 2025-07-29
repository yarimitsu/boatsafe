/**
 * Discussion Widget - Area Forecast Discussion
 */
class Discussion {
    constructor() {
        this.container = document.getElementById('discussion');
        this.content = this.container.querySelector('.discussion-content');
        this.toggleButton = document.getElementById('discussion-toggle');
        this.regionDropdown = document.getElementById('discussion-region-dropdown');
        this.discussionDisplay = this.container.querySelector('.discussion-display');
        this.currentData = null;
        this.currentOffice = null;
        this.isExpanded = false;
        
        this.init();
    }

    /**
     * Initialize the widget
     */
    async init() {
        this.setupToggleButton();
        this.setupRegionSelector();
        
        // Default to collapsed state, don't auto-load discussion
        this.content.style.display = 'none';
        this.isExpanded = false;
        
        // Load default region preference
        this.loadSavedPreferences();
    }

    /**
     * Setup toggle button functionality
     */
    setupToggleButton() {
        if (!this.toggleButton) return;
        
        this.toggleButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleDiscussion();
        });
    }

    /**
     * Setup region selector
     */
    setupRegionSelector() {
        if (!this.regionDropdown) return;
        
        this.regionDropdown.addEventListener('change', (e) => {
            const selectedRegion = e.target.value;
            this.selectRegion(selectedRegion);
        });
    }

    /**
     * Toggle discussion visibility
     */
    toggleDiscussion() {
        this.isExpanded = !this.isExpanded;
        
        if (this.isExpanded) {
            this.expandDiscussion();
        } else {
            this.collapseDiscussion();
        }
        
        // Update toggle button state
        this.toggleButton.setAttribute('aria-expanded', this.isExpanded);
    }

    /**
     * Expand discussion content
     */
    expandDiscussion() {
        this.content.classList.add('expanding');
        this.content.style.display = 'block';
        
        // Load discussion if not loaded or if we need to refresh
        if (!this.currentData || this.shouldRefreshData()) {
            this.loadDiscussion(this.currentOffice || 'AJK');
        }
        
        // Remove expanding class after animation
        setTimeout(() => {
            this.content.classList.remove('expanding');
        }, 300);
    }

    /**
     * Collapse discussion content
     */
    collapseDiscussion() {
        this.content.classList.add('collapsing');
        
        setTimeout(() => {
            this.content.style.display = 'none';
            this.content.classList.remove('collapsing');
        }, 300);
    }

    /**
     * Select a region for discussion
     * @param {string} regionCode - Region office code (AJK, AFC, AFG)
     */
    selectRegion(regionCode) {
        if (!regionCode) return;
        
        this.currentOffice = regionCode;
        
        // Save preference
        try {
            localStorage.setItem('boatsafe_discussion_region', regionCode);
        } catch (error) {
            console.warn('Failed to save region preference:', error);
        }
        
        // If expanded, reload discussion for new region
        if (this.isExpanded) {
            this.loadDiscussion(regionCode);
        }
    }

    /**
     * Load saved preferences
     */
    loadSavedPreferences() {
        try {
            const savedRegion = localStorage.getItem('boatsafe_discussion_region');
            if (savedRegion && this.regionDropdown) {
                this.regionDropdown.value = savedRegion;
                this.currentOffice = savedRegion;
            }
        } catch (error) {
            console.warn('Failed to load saved preferences:', error);
        }
    }

    /**
     * Check if data should be refreshed (older than 30 minutes)
     */
    shouldRefreshData() {
        if (!this.currentData || !this.currentData.properties?.updated) {
            return true;
        }
        
        const updated = new Date(this.currentData.properties.updated);
        const now = new Date();
        const diffMinutes = (now - updated) / (1000 * 60);
        
        return diffMinutes > 30;
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
                this.showLocalDevPlaceholder(office);
            } else {
                // Production - fetch real data via Netlify function with office parameter
                const proxyUrl = `${currentHost}/.netlify/functions/forecast-discussion?office=${encodeURIComponent(office)}`;
                console.log(`Fetching forecast discussion for ${office} from:`, proxyUrl);
                const data = await window.BoatSafe.http.get(proxyUrl, { cacheTTL: 30 });
                console.log('Received forecast discussion data:', data);
                this.currentData = data;
                this.render();
            }
        } catch (error) {
            console.error('Failed to load forecast discussion:', error);
            this.showError(`Unable to load forecast discussion for ${this.getOfficeName(office)}`);
        }
    }

    /**
     * Get office name from code
     * @param {string} officeCode - Office code (AJK, AFC, AFG)
     * @returns {string} Office name
     */
    getOfficeName(officeCode) {
        const officeNames = {
            'AJK': 'Southeast Alaska (Juneau)',
            'AFC': 'Southcentral Alaska (Anchorage)', 
            'AFG': 'Northern Alaska (Fairbanks)'
        };
        return officeNames[officeCode] || officeCode;
    }

    /**
     * Show local development placeholder
     * @param {string} office - Office code
     */
    showLocalDevPlaceholder(office = 'AJK') {
        const officeName = this.getOfficeName(office);
        const content = this.discussionDisplay || this.content;
        content.innerHTML = `
            <div class="forecast-period">
                <div class="period-header">
                    <strong>Forecast Discussion - ${officeName}</strong>
                    <span class="period-time">Local Development Mode</span>
                </div>
                <div class="forecast-text">
                    Deploy to Netlify to see the real Area Forecast Discussion from meteorologists for ${officeName}.
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
                    <strong>Forecast Discussion - ${officeName || this.getOfficeName(office)}</strong>
                    <div class="discussion-meta">
                        <span class="period-time">NOAA Update: ${issuedTime || this.formatDate(new Date(updated))}</span>
                        <a href="https://www.weather.gov/ajk/MarineForecasts" target="_blank" rel="noopener" class="noaa-link">View NOAA Dataset →</a>
                    </div>
                </div>
                <div class="forecast-text">
                    ${this.formatText(text)}
                </div>
            </div>
        `;

        const content = this.discussionDisplay || this.content;
        content.innerHTML = html;
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
            // Remove USA.gov references and everything after them until next section
            .replace(/usa\.gov.*?(?=\n\n|\n\s*\n|$)/gis, '')
            // Remove bullet points and lists that often appear after usa.gov
            .replace(/^\s*[•·\-\*]\s*[^\n]*$/gm, '')
            // Remove remaining bullet-like patterns
            .replace(/\s*[•·▪▫]\s*/g, ' ')
            // Remove excessive whitespace but preserve intentional line breaks
            .replace(/[ \t]+/g, ' ')
            .replace(/\n[ \t]+/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        // Enhanced paragraph breaking for meteorological discussions
        let paragraphs = [];
        
        // First try splitting on double line breaks or section markers
        let initialSplit = cleanedText.split(/\n\n+|\.{3,}/);
        
        if (initialSplit.length === 1) {
            // No clear breaks found, use intelligent sentence-based breaking
            let sentences = cleanedText.split(/\.\s+/);
            let currentParagraph = '';
            
            for (let i = 0; i < sentences.length; i++) {
                let sentence = sentences[i].trim();
                if (!sentence) continue;
                
                // Add period back unless it's the last sentence
                if (i < sentences.length - 1) {
                    sentence += '.';
                }
                
                // Start new paragraph on meteorological section keywords
                if (this.shouldStartNewParagraph(sentence, currentParagraph)) {
                    if (currentParagraph.trim()) {
                        paragraphs.push(currentParagraph.trim());
                    }
                    currentParagraph = sentence;
                } else {
                    currentParagraph += (currentParagraph ? ' ' : '') + sentence;
                }
                
                // Break long paragraphs (more than 3 sentences for better readability)
                if (currentParagraph.split(/\.\s+/).length >= 3) {
                    paragraphs.push(currentParagraph.trim());
                    currentParagraph = '';
                }
            }
            
            // Add remaining content
            if (currentParagraph.trim()) {
                paragraphs.push(currentParagraph.trim());
            }
        } else {
            // Use existing breaks but clean and filter them
            paragraphs = initialSplit
                .map(p => p.trim())
                .filter(p => p.length > 15); // Filter out very short fragments
        }
        
        // Ensure minimum paragraph count for readability
        if (paragraphs.length === 1 && paragraphs[0].length > 600) {
            paragraphs = this.forceParagraphBreaks(paragraphs[0]);
        }
        
        // Format paragraphs with proper HTML spacing
        let formatted = paragraphs
            .map(paragraph => {
                // Break very long paragraphs at sentence boundaries
                if (paragraph.length > 700) {
                    return this.breakLongParagraph(paragraph);
                }
                return `<p>${paragraph}</p>`;
            })
            .join('');
        
        // Fallback for edge cases
        if (!formatted || paragraphs.length === 0) {
            formatted = `<p>${cleanedText.replace(/\n/g, '<br>')}</p>`;
        }
        
        // Enhanced formatting with weather terminology
        formatted = formatted
            // Highlight time periods with better formatting
            .replace(/\b(TODAY|TONIGHT|TOMORROW|THIS EVENING|THIS MORNING|THIS AFTERNOON|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY)\b/gi, '<strong>$1</strong>')
            // Highlight weather systems and patterns
            .replace(/\b(LOW PRESSURE|HIGH PRESSURE|FRONT|TROUGH|RIDGE|STORM SYSTEM|WEATHER SYSTEM|CYCLONE|ANTICYCLONE)\b/gi, '<strong>$1</strong>')
            // Highlight weather conditions with subtle emphasis
            .replace(/\b(RAIN|SNOW|THUNDERSTORMS|FOG|WIND|GALE|STORM|CLEAR|CLOUDY|PARTLY CLOUDY|OVERCAST|SHOWERS|DRIZZLE|VISIBILITY|PRECIPITATION)\b/gi, '<em>$1</em>')
            // Highlight marine conditions  
            .replace(/\b(SEAS|WAVES|SWELL|CHOPPY|ROUGH|CALM|SURF|BREAKERS|SIGNIFICANT WAVE HEIGHT|COMBINED SEAS)\b/gi, '<em>$1</em>')
            // Format wind directions with better styling
            .replace(/\b([NSEW]|NE|NW|SE|SW|NORTH|SOUTH|EAST|WEST|NORTHEAST|NORTHWEST|SOUTHEAST|SOUTHWEST)\b/gi, '<span class="wind-direction">$1</span>')
            // Highlight wind speeds and weather measurements
            .replace(/\b(\d+\s*(?:MPH|KT|KNOTS?|FT|FEET|INCHES?|IN|MILES?|NAUTICAL MILES?))\b/gi, '<span class="weather-measurement">$1</span>')
            // Format temperature ranges
            .replace(/\b(\d+\s*(?:DEGREES?|°F?|°C?))\b/gi, '<span class="weather-measurement">$1</span>');
        
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
            'NEAR TERM', 'EXTENDED', 'FORECAST', 'OUTLOOK', 'UPDATE'
        ];
        
        const upperSentence = sentence.toUpperCase();
        return newSectionKeywords.some(keyword => 
            upperSentence.startsWith(keyword) || 
            upperSentence.startsWith(keyword + '...')
        );
    }

    /**
     * Force paragraph breaks for very long text blocks
     * @param {string} text - Long text block
     * @returns {Array<string>} Array of paragraph strings
     */
    forceParagraphBreaks(text) {
        const sentences = text.split(/\.\s+/);
        const paragraphs = [];
        let currentParagraph = '';
        
        for (let i = 0; i < sentences.length; i++) {
            let sentence = sentences[i].trim();
            if (!sentence) continue;
            
            // Add period back unless it's the last sentence
            if (i < sentences.length - 1) {
                sentence += '.';
            }
            
            // Start new paragraph every 2-3 sentences for long discussions
            if (currentParagraph && currentParagraph.split(/\.\s+/).length >= 2) {
                paragraphs.push(currentParagraph.trim());
                currentParagraph = sentence;
            } else {
                currentParagraph += (currentParagraph ? ' ' : '') + sentence;
            }
        }
        
        // Add remaining content
        if (currentParagraph.trim()) {
            paragraphs.push(currentParagraph.trim());
        }
        
        return paragraphs;
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
            
            // Break on length or logical weather discussion boundaries
            if (currentChunk && (
                (currentChunk + ' ' + sentence).length > 350 ||
                this.shouldStartNewParagraph(sentence, currentChunk)
            )) {
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
        const content = this.discussionDisplay || this.content;
        const officeName = this.currentOffice ? this.getOfficeName(this.currentOffice) : '';
        const loadingText = officeName ? `Loading discussion for ${officeName}...` : 'Loading discussion...';
        content.innerHTML = `<div class="loading">${loadingText}</div>`;
    }

    /**
     * Show error state
     * @param {string} message - Error message
     */
    showError(message) {
        const content = this.discussionDisplay || this.content;
        content.innerHTML = `
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