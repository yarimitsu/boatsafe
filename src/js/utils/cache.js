/**
 * Cache utility for storing and retrieving data with TTL
 */
class Cache {
    constructor() {
        this.storage = window.localStorage;
        this.prefix = 'bightwatch_';
    }

    /**
     * Store data with expiration time
     * @param {string} key - Cache key
     * @param {any} data - Data to store
     * @param {number} ttlMinutes - Time to live in minutes
     */
    set(key, data, ttlMinutes = 30) {
        const expiryTime = Date.now() + (ttlMinutes * 60 * 1000);
        const cacheItem = {
            data,
            expiry: expiryTime,
            timestamp: Date.now()
        };
        
        try {
            this.storage.setItem(this.prefix + key, JSON.stringify(cacheItem));
        } catch (error) {
            console.warn('Cache storage failed:', error);
        }
    }

    /**
     * Retrieve data from cache if not expired
     * @param {string} key - Cache key
     * @returns {any|null} Cached data or null if expired/not found
     */
    get(key) {
        try {
            const item = this.storage.getItem(this.prefix + key);
            if (!item) return null;

            const cacheItem = JSON.parse(item);
            
            // Check if expired
            if (Date.now() > cacheItem.expiry) {
                this.remove(key);
                return null;
            }

            return cacheItem.data;
        } catch (error) {
            console.warn('Cache retrieval failed:', error);
            return null;
        }
    }

    /**
     * Remove item from cache
     * @param {string} key - Cache key
     */
    remove(key) {
        try {
            this.storage.removeItem(this.prefix + key);
        } catch (error) {
            console.warn('Cache removal failed:', error);
        }
    }

    /**
     * Clear all cache items
     */
    clear() {
        try {
            const keys = Object.keys(this.storage);
            keys.forEach(key => {
                if (key.startsWith(this.prefix)) {
                    this.storage.removeItem(key);
                }
            });
        } catch (error) {
            console.warn('Cache clear failed:', error);
        }
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache stats
     */
    getStats() {
        const keys = Object.keys(this.storage);
        const cacheKeys = keys.filter(key => key.startsWith(this.prefix));
        
        let totalSize = 0;
        let validItems = 0;
        let expiredItems = 0;

        cacheKeys.forEach(key => {
            const item = this.storage.getItem(key);
            if (item) {
                totalSize += item.length;
                try {
                    const cacheItem = JSON.parse(item);
                    if (Date.now() > cacheItem.expiry) {
                        expiredItems++;
                    } else {
                        validItems++;
                    }
                } catch (error) {
                    expiredItems++;
                }
            }
        });

        return {
            totalItems: cacheKeys.length,
            validItems,
            expiredItems,
            totalSize,
            sizeKB: Math.round(totalSize / 1024)
        };
    }

    /**
     * Clean up expired items
     */
    cleanup() {
        const keys = Object.keys(this.storage);
        const cacheKeys = keys.filter(key => key.startsWith(this.prefix));
        
        cacheKeys.forEach(key => {
            try {
                const item = this.storage.getItem(key);
                if (item) {
                    const cacheItem = JSON.parse(item);
                    if (Date.now() > cacheItem.expiry) {
                        this.storage.removeItem(key);
                    }
                }
            } catch (error) {
                // Remove corrupted items
                this.storage.removeItem(key);
            }
        });
    }
}

// Global cache instance
window.BightWatch = window.BightWatch || {};
window.BightWatch.cache = new Cache();

// Clean up expired items on page load
window.addEventListener('load', () => {
    window.BightWatch.cache.cleanup();
});