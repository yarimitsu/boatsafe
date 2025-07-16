/**
 * NOAA Forecast Parser - Converts raw text forecasts to structured data
 */
class ForecastParser {
    constructor() {
        this.windDirections = {
            'N': 'North', 'NNE': 'North-Northeast', 'NE': 'Northeast', 'ENE': 'East-Northeast',
            'E': 'East', 'ESE': 'East-Southeast', 'SE': 'Southeast', 'SSE': 'South-Southeast',
            'S': 'South', 'SSW': 'South-Southwest', 'SW': 'Southwest', 'WSW': 'West-Southwest',
            'W': 'West', 'WNW': 'West-Northwest', 'NW': 'Northwest', 'NNW': 'North-Northwest',
            'VAR': 'Variable', 'VRB': 'Variable'
        };
        
        this.windDescriptions = {
            'LT': 'Light', 'LIGHT': 'Light',
            'MOD': 'Moderate', 'MODERATE': 'Moderate',
            'FRESH': 'Fresh', 'STRONG': 'Strong',
            'GALE': 'Gale', 'STORM': 'Storm'
        };
    }

    /**
     * Parse NOAA Coastal Waters Forecast (CWF)
     * @param {string} rawText - Raw forecast text
     * @returns {Object} Parsed forecast data
     */
    parseCWF(rawText) {
        if (!rawText || typeof rawText !== 'string') {
            throw new Error('Invalid forecast text');
        }

        const lines = rawText.split('\n').map(line => line.trim()).filter(line => line);
        
        const forecast = {
            zone: null,
            zoneName: null,
            office: null,
            issued: null,
            periods: [],
            raw: rawText
        };

        // Parse header information
        this.parseHeader(lines, forecast);
        
        // Parse forecast periods
        this.parseForecastPeriods(lines, forecast);
        
        return forecast;
    }

    /**
     * Parse forecast header information
     * @param {Array} lines - Text lines
     * @param {Object} forecast - Forecast object to populate
     */
    parseHeader(lines, forecast) {
        const headerLines = lines.slice(0, 10);
        
        headerLines.forEach(line => {
            // Zone information
            if (line.includes('COASTAL WATERS FORECAST') || line.includes('MARINE WEATHER STATEMENT')) {
                const zoneMatch = line.match(/PK(Z\d+)/);
                if (zoneMatch) {
                    forecast.zone = 'PK' + zoneMatch[1];
                }
            }
            
            // Office information
            if (line.includes('NATIONAL WEATHER SERVICE')) {
                const officeMatch = line.match(/NATIONAL WEATHER SERVICE\s+(\w+)/);
                if (officeMatch) {
                    forecast.office = officeMatch[1];
                }
            }
            
            // Issue time
            if (line.match(/\d{3,4}\s+(AM|PM)\s+\w+\s+\w+\s+\d{1,2}\s+\d{4}/)) {
                forecast.issued = this.parseDateTime(line);
            }
        });
    }

    /**
     * Parse forecast periods
     * @param {Array} lines - Text lines
     * @param {Object} forecast - Forecast object to populate
     */
    parseForecastPeriods(lines, forecast) {
        let currentPeriod = null;
        let inPeriod = false;
        
        lines.forEach(line => {
            // Look for period headers (TODAY, TONIGHT, TOMORROW, etc.)
            const periodMatch = line.match(/^\.?(TODAY|TONIGHT|TOMORROW|FRIDAY|SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY)\.?\.?\.?/i);
            
            if (periodMatch) {
                // Save previous period
                if (currentPeriod) {
                    forecast.periods.push(this.processPeriod(currentPeriod));
                }
                
                // Start new period
                currentPeriod = {
                    name: periodMatch[1].toUpperCase(),
                    text: line,
                    wind: null,
                    waves: null,
                    weather: null
                };
                inPeriod = true;
                return;
            }
            
            // Continue building current period
            if (inPeriod && currentPeriod) {
                // Skip empty lines and section headers
                if (line && !line.includes('$$') && !line.includes('FORECAST') && !line.includes('SYNOPSIS')) {
                    currentPeriod.text += ' ' + line;
                }
            }
        });
        
        // Don't forget the last period
        if (currentPeriod) {
            forecast.periods.push(this.processPeriod(currentPeriod));
        }
    }

    /**
     * Process individual forecast period
     * @param {Object} period - Raw period data
     * @returns {Object} Processed period
     */
    processPeriod(period) {
        const processed = {
            name: period.name,
            text: period.text.trim(),
            wind: this.parseWind(period.text),
            waves: this.parseWaves(period.text),
            weather: this.parseWeather(period.text),
            summary: this.generateSummary(period.text)
        };
        
        return processed;
    }

    /**
     * Parse wind information
     * @param {string} text - Period text
     * @returns {Object} Wind data
     */
    parseWind(text) {
        const windPatterns = [
            /WIND[S]?\s+([A-Z]{1,3})\s+(\d+)(?:\s*TO\s*(\d+))?\s*KT/i,
            /([A-Z]{1,3})\s+(?:WIND[S]?\s+)?(\d+)(?:\s*TO\s*(\d+))?\s*KT/i,
            /WIND[S]?\s+(\d+)(?:\s*TO\s*(\d+))?\s*KT\s+([A-Z]{1,3})/i
        ];

        for (const pattern of windPatterns) {
            const match = text.match(pattern);
            if (match) {
                const direction = match[1] || match[3];
                const speed = parseInt(match[2]);
                const maxSpeed = match[3] ? parseInt(match[3]) : null;
                
                return {
                    direction: direction.toUpperCase(),
                    directionName: this.windDirections[direction.toUpperCase()] || direction,
                    speed,
                    maxSpeed,
                    description: this.getWindDescription(speed),
                    raw: match[0]
                };
            }
        }

        return null;
    }

    /**
     * Parse wave information
     * @param {string} text - Period text
     * @returns {Object} Wave data
     */
    parseWaves(text) {
        const wavePatterns = [
            /WAVES?\s+(\d+)(?:\s*TO\s*(\d+))?\s*FT/i,
            /SEAS?\s+(\d+)(?:\s*TO\s*(\d+))?\s*FT/i,
            /(\d+)(?:\s*TO\s*(\d+))?\s*FT\s+WAVES?/i
        ];

        for (const pattern of wavePatterns) {
            const match = text.match(pattern);
            if (match) {
                const height = parseInt(match[1]);
                const maxHeight = match[2] ? parseInt(match[2]) : null;
                
                return {
                    height,
                    maxHeight,
                    description: this.getWaveDescription(height),
                    raw: match[0]
                };
            }
        }

        return null;
    }

    /**
     * Parse weather conditions
     * @param {string} text - Period text
     * @returns {Object} Weather data
     */
    parseWeather(text) {
        const weatherKeywords = [
            'RAIN', 'SHOWERS', 'DRIZZLE', 'SNOW', 'SLEET', 'HAIL',
            'THUNDERSTORMS', 'FOG', 'MIST', 'HAZE', 'SMOKE',
            'CLEAR', 'SUNNY', 'PARTLY CLOUDY', 'MOSTLY CLOUDY', 'OVERCAST',
            'VISIBILITY', 'FREEZING'
        ];

        const foundWeather = [];
        
        weatherKeywords.forEach(keyword => {
            if (text.toUpperCase().includes(keyword)) {
                foundWeather.push(keyword);
            }
        });

        if (foundWeather.length === 0) {
            return null;
        }

        return {
            conditions: foundWeather,
            description: this.getWeatherDescription(foundWeather),
            raw: foundWeather.join(', ')
        };
    }

    /**
     * Generate human-readable summary
     * @param {string} text - Period text
     * @returns {string} Summary
     */
    generateSummary(text) {
        const wind = this.parseWind(text);
        const waves = this.parseWaves(text);
        const weather = this.parseWeather(text);
        
        let summary = '';
        
        if (wind) {
            summary += `${wind.description} ${wind.directionName.toLowerCase()} winds at ${wind.speed}${wind.maxSpeed ? '-' + wind.maxSpeed : ''} knots. `;
        }
        
        if (waves) {
            summary += `${waves.description} seas ${waves.height}${waves.maxHeight ? '-' + waves.maxHeight : ''} feet. `;
        }
        
        if (weather) {
            summary += `${weather.description}.`;
        }
        
        return summary.trim() || 'Conditions as described in forecast.';
    }

    /**
     * Get wind description based on speed
     * @param {number} speed - Wind speed in knots
     * @returns {string} Description
     */
    getWindDescription(speed) {
        if (speed < 7) return 'Light';
        if (speed < 17) return 'Moderate';
        if (speed < 27) return 'Fresh';
        if (speed < 34) return 'Strong';
        if (speed < 48) return 'Gale';
        return 'Storm';
    }

    /**
     * Get wave description based on height
     * @param {number} height - Wave height in feet
     * @returns {string} Description
     */
    getWaveDescription(height) {
        if (height < 2) return 'Calm';
        if (height < 4) return 'Light';
        if (height < 6) return 'Moderate';
        if (height < 10) return 'Rough';
        return 'Very rough';
    }

    /**
     * Get weather description
     * @param {Array} conditions - Weather conditions
     * @returns {string} Description
     */
    getWeatherDescription(conditions) {
        if (conditions.includes('THUNDERSTORMS')) return 'Thunderstorms possible';
        if (conditions.includes('RAIN') || conditions.includes('SHOWERS')) return 'Rain expected';
        if (conditions.includes('FOG')) return 'Fog possible';
        if (conditions.includes('CLEAR') || conditions.includes('SUNNY')) return 'Clear conditions';
        return 'Weather conditions as described';
    }

    /**
     * Parse date/time string
     * @param {string} dateStr - Date string
     * @returns {Date} Parsed date
     */
    parseDateTime(dateStr) {
        try {
            // This is a simplified parser - in production, you'd want more robust date parsing
            const match = dateStr.match(/(\d{3,4})\s+(AM|PM)\s+(\w+)\s+(\w+)\s+(\d{1,2})\s+(\d{4})/);
            if (match) {
                const [, time, ampm, dayOfWeek, month, day, year] = match;
                // Convert to standard time format and create date
                // This is a placeholder - implement proper date parsing
                return new Date();
            }
        } catch (error) {
            console.warn('Date parsing failed:', error);
        }
        return new Date();
    }
}

// Global forecast parser instance
window.BightWatch = window.BightWatch || {};
window.BightWatch.parser = new ForecastParser();