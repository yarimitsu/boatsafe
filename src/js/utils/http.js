/**
 * HTTP utility for making API requests with caching and error handling
 */
class HttpClient {
    constructor() {
        this.cache = window.BightWatch.cache;
        this.baseTimeout = 10000; // 10 seconds
    }

    /**
     * Make HTTP GET request with caching
     * @param {string} url - URL to fetch
     * @param {Object} options - Request options
     * @returns {Promise} Response data
     */
    async get(url, options = {}) {
        const {
            cacheTTL = 30, // 30 minutes default
            skipCache = false,
            timeout = this.baseTimeout,
            retries = 3
        } = options;

        const cacheKey = this.getCacheKey(url);
        
        // Check cache first
        if (!skipCache) {
            const cachedData = this.cache.get(cacheKey);
            if (cachedData) {
                return cachedData;
            }
        }

        // Make request with retries
        let lastError;
        for (let i = 0; i < retries; i++) {
            try {
                const data = await this.fetchWithTimeout(url, timeout);
                
                // Cache successful response
                if (cacheTTL > 0) {
                    this.cache.set(cacheKey, data, cacheTTL);
                }
                
                return data;
            } catch (error) {
                lastError = error;
                if (i < retries - 1) {
                    // Exponential backoff
                    await this.delay(Math.pow(2, i) * 1000);
                }
            }
        }

        throw lastError;
    }

    /**
     * Fetch with timeout
     * @param {string} url - URL to fetch
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise} Response data
     */
    async fetchWithTimeout(url, timeout) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json,text/plain',
                    'Cache-Control': 'no-cache'
                }
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type');
            
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            } else {
                return await response.text();
            }
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            
            throw error;
        }
    }

    /**
     * Generate cache key from URL
     * @param {string} url - URL
     * @returns {string} Cache key
     */
    getCacheKey(url) {
        return 'http_' + btoa(url).replace(/[^a-zA-Z0-9]/g, '');
    }

    /**
     * Delay utility
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise} Promise that resolves after delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Check if URL is accessible (CORS-friendly)
     * @param {string} url - URL to check
     * @returns {Promise<boolean>} Whether URL is accessible
     */
    async isAccessible(url) {
        try {
            const response = await fetch(url, {
                method: 'HEAD',
                mode: 'no-cors'
            });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get request status for debugging
     * @param {string} url - URL
     * @returns {Object} Request status
     */
    getRequestStatus(url) {
        const cacheKey = this.getCacheKey(url);
        const cached = this.cache.get(cacheKey);
        
        return {
            url,
            cached: !!cached,
            cacheKey,
            timestamp: cached ? new Date().toISOString() : null
        };
    }
}

// Global HTTP client instance
window.BightWatch = window.BightWatch || {};
window.BightWatch.http = new HttpClient();