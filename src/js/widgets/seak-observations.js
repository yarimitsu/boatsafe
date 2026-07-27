/**
 * SEAK Observations Widget
 * Shows two live observation tables for Southeast Alaska (no station picking):
 *   - Marine Exchange of Alaska sites (allMarEx.json)
 *   - NWS SE Alaska observation roundup (allSEAKobs.json)
 * Both feeds are CORS-enabled on www.weather.gov and fetched directly.
 * Mirrors https://www.weather.gov/ajk/MarineObservations
 */
class SEAKObservations {
    static MAREX_URL = 'https://www.weather.gov/source/ajk/obs/marex/allMarEx.json';
    static ROUNDUP_URL = 'https://www.weather.gov/source/ajk/obs/roundup/allSEAKobs.json';
    static DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                   'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

    constructor() {
        this.container = document.getElementById('observations');
        this.content = this.container.querySelector('.observations-content');
        this.toggleButton = document.getElementById('observations-toggle');
        this.display = this.container.querySelector('.observations-display');
        this.isExpanded = true;

        this.init();
    }

    init() {
        this.setupToggleButton();
        this.showLoading('Loading Southeast Alaska observations...');
        this.loadObservations();
        // Observations refresh often; reload every 10 minutes while visible.
        setInterval(() => { if (!document.hidden) this.loadObservations(); }, 10 * 60 * 1000);
    }

    setupToggleButton() {
        if (!this.toggleButton) return;
        this.toggleButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.isExpanded = !this.isExpanded;
            this.content.style.display = this.isExpanded ? 'block' : 'none';
            this.toggleButton.setAttribute('aria-expanded', String(this.isExpanded));
            const chevron = this.toggleButton.querySelector('.chevron-icon');
            if (chevron) chevron.classList.toggle('expanded', this.isExpanded);
        });
    }

    async loadObservations() {
        try {
            const [marex, roundup] = await Promise.all([
                this.fetchJson(SEAKObservations.MAREX_URL).catch(() => null),
                this.fetchJson(SEAKObservations.ROUNDUP_URL).catch(() => null)
            ]);

            if (!marex && !roundup) {
                this.showError('Observations are not available right now. Please try again later.');
                return;
            }

            const html =
                this.renderMarexTable(marex) +
                this.renderRoundupTable(roundup);
            this.display.innerHTML = html || '<div class="loading">No observation data available.</div>';
        } catch (error) {
            console.error('Failed to load observations:', error);
            this.showError(`Failed to load observations: ${error.message}`);
        }
    }

    async fetchJson(url) {
        const res = await window.BoatSafe.http.get(url, { cacheTTL: 10 });
        return typeof res === 'string' ? JSON.parse(res) : res;
    }

    /* ---------------- Marine Exchange table (wind in knots) ---------------- */

    renderMarexTable(data) {
        const rows = (data && Array.isArray(data.marexData)) ? data.marexData : [];
        if (rows.length === 0) return '';

        rows.sort((a, b) => String(a.site).localeCompare(String(b.site)));

        const body = rows.map(r => {
            const reported = this.marexTime(r.date, r.time);
            const wind = this.windText(this.degToCardinal(r.windDir), r.windSpd);
            const gust = this.windText(this.degToCardinal(r.gustDir), r.gustSpd);
            return `<tr>
                <td class="obs-site">${this.esc(this.marexSite(r.site))}</td>
                <td>${this.esc(reported)}</td>
                <td>${this.num(r.temp, 0)}</td>
                <td>${this.num(r.dewPt, 0)}</td>
                <td>${this.num(r.rh, 0)}</td>
                <td>${wind}</td>
                <td>${gust}</td>
                <td>${this.num(r.pressure, 0)}</td>
            </tr>`;
        }).join('');

        return `
            <div class="obs-section">
                <h3 class="obs-title">Marine Exchange Observations</h3>
                <div class="obs-table-wrap">
                    <table class="obs-table">
                        <thead><tr>
                            <th>Site</th><th>Reported</th><th>Temp<br>&deg;F</th>
                            <th>Dew Pt<br>&deg;F</th><th>RH<br>%</th>
                            <th>Wind<br>kt</th><th>Gust<br>kt</th><th>Press<br>mb</th>
                        </tr></thead>
                        <tbody>${body}</tbody>
                    </table>
                </div>
            </div>`;
    }

    // Marine Exchange timestamps are UTC (date "MM/DD/YYYY", time "HH:MM").
    marexTime(date, time) {
        if (!date || !time) return '—';
        const [mo, da, yr] = String(date).split('/').map(Number);
        const [hh, mm] = String(time).split(':').map(Number);
        if ([mo, da, yr, hh, mm].some(n => Number.isNaN(n))) return '—';
        const d = new Date(Date.UTC(yr, mo - 1, da, hh, mm));
        return d.toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
        });
    }

    // NWS page relabels this one site.
    marexSite(site) {
        return site === 'MENDENHALL VALLEY' ? 'INDUSTRIAL BLVD' : site;
    }

    /* ---------------- NWS roundup table (wind in mph) ---------------- */

    renderRoundupTable(data) {
        let rows = (data && Array.isArray(data.obData)) ? data.obData : [];
        if (rows.length === 0) return '';

        const updated = this.formatLocal(data.ts);
        // The roundup also carries river/lab gauges that report almost nothing;
        // keep only stations with an actual temperature or wind reading.
        rows = rows.filter(r => this.clean(r.temp) !== '—' || this.clean(r.windSpd) !== '—');
        rows.sort((a, b) => String(a.stnName || a.stn).localeCompare(String(b.stnName || b.stn)));

        const body = rows.map(r => {
            const wind = this.windText(this.clean(r.windDir), r.windSpd);
            return `<tr>
                <td class="obs-site">${this.esc(r.stnName || r.stn)}</td>
                <td>${this.num(r.temp, 0)}</td>
                <td>${wind}</td>
                <td>${this.num(r.windGust, 0)}</td>
                <td>${this.num(r.seaLevelPressure, 0)}</td>
                <td>${this.num(r.visibility, 1)}</td>
            </tr>`;
        }).join('');

        return `
            <div class="obs-section">
                <h3 class="obs-title">Southeast Alaska Observations</h3>
                ${updated ? `<div class="obs-updated">NOAA update: ${this.esc(updated)}</div>` : ''}
                <div class="obs-table-wrap">
                    <table class="obs-table">
                        <thead><tr>
                            <th>Station</th><th>Temp<br>&deg;F</th><th>Wind<br>mph</th>
                            <th>Gust<br>mph</th><th>Press<br>mb</th><th>Vis<br>mi</th>
                        </tr></thead>
                        <tbody>${body}</tbody>
                    </table>
                </div>
                <div class="obs-link">
                    <a href="https://www.weather.gov/ajk/MarineObservations" target="_blank" rel="noopener">
                        All SE Alaska Marine Observations &rarr;
                    </a>
                </div>
            </div>`;
    }

    /* ---------------- helpers ---------------- */

    degToCardinal(deg) {
        if (deg === null || deg === undefined || deg === '') return '';
        const n = parseFloat(deg);
        if (Number.isNaN(n)) return '';
        return SEAKObservations.DIRS[Math.round(((n % 360) + 360) % 360 / 22.5) % 16];
    }

    windText(dir, spd) {
        const s = this.num(spd, 0);
        if (s === '—') return '—';
        return `${dir ? dir + ' ' : ''}${s}`;
    }

    // Normalize NOAA "missing" markers to an em dash.
    clean(v) {
        if (v === null || v === undefined) return '—';
        const s = String(v).trim();
        return (s === '' || s === '-' || s === '--' || s === 'M') ? '—' : s;
    }

    num(v, digits) {
        const c = this.clean(v);
        if (c === '—') return '—';
        const n = parseFloat(c);
        return Number.isNaN(n) ? this.esc(c) : n.toFixed(digits);
    }

    formatLocal(ts) {
        if (!ts) return '';
        const clean = String(ts).replace(' Local', '');
        const d = new Date(clean);
        if (Number.isNaN(d.getTime())) return String(ts);
        return d.toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
        });
    }

    esc(s) {
        return String(s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    showLoading(message = 'Loading...') {
        if (this.display) this.display.innerHTML = `<div class="loading">${message}</div>`;
    }

    showError(message) {
        if (this.display) {
            this.display.innerHTML =
                `<div class="status-message status-error"><strong>Error:</strong> ${this.esc(message)}</div>`;
        }
    }

    clear() {
        this.showLoading('Loading Southeast Alaska observations...');
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.SEAKObservations = SEAKObservations;
}
