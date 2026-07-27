/**
 * Tides & Currents Dual Widget
 * Tide stations are picked from a self-contained SVG map (see tide-map.js);
 * the map view filters the station dropdown. Selecting a station renders the
 * predicted tide curve plus high/low events.
 */
class TidesCurrents {
    // NOAA CO-OPS datagetter — CORS-enabled, called directly (no proxy)
    static COOPS_BASE = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';

    constructor() {
        this.container = document.getElementById('tides-currents');
        this.content = this.container.querySelector('.tides-currents-content');
        this.toggleButton = document.getElementById('tides-toggle');
        this.isExpanded = true;

        this.mapContainer = document.getElementById('tide-map');
        this.mapControls = this.container.querySelector('.tide-map-controls');
        this.tideDropdown = document.getElementById('tide-station-dropdown');
        this.tideDataContainer = this.container.querySelector('.tide-data-container');

        this.currentMapContainer = document.getElementById('current-map');
        this.currentMapControls = this.container.querySelector('.current-map-controls');
        this.currentDropdown = document.getElementById('current-station-dropdown');
        this.currentDataContainer = this.container.querySelector('.current-data-container');

        this.tideDateNav = this.container.querySelector('.tide-date-navigation');
        this.currentDateNav = this.container.querySelector('.current-date-navigation');

        // Tides and currents each have their own independent date.
        this.tideDate = new Date();
        this.currentsDate = new Date();
        this.currentTideStationId = null;
        this.currentCurrentStationId = null;
        this.tideStations = null;
        this.currentStations = null;
        this.map = null;
        this.currentMap = null;

        this.init();
    }

    async init() {
        try {
            this.setupToggleButton();
            this.renderDateScrollers();
            await this.loadStations();
            this.setupEventListeners();
            await this.initMap();
            await this.initCurrentMap();
            this.showTideDefault();
            this.showCurrentDefault();
            this.restoreSavedStation();
            this.restoreSavedCurrentStation();
        } catch (error) {
            console.error('Tides & Currents init failed:', error);
            this.tideDataContainer.innerHTML =
                '<div class="status-message status-error">Tide stations could not be loaded. Please try again later.</div>';
        }
    }

    // Collapse/expand, matching the other widgets' header chevron behavior
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

    async loadStations() {
        await Promise.all([
            this.loadTideStations(),
            this.loadCurrentStations()
        ]);
    }

    async loadTideStations() {
        // Alaska-only file (~11 KB gzipped); no client-side filtering needed
        const response = await window.BoatSafe.http.get('./data/ak-tide-stations.json', { skipCache: true, cacheTTL: 0 });
        this.tideStations = typeof response === 'string' ? JSON.parse(response) : response;
    }

    async loadCurrentStations() {
        // Full Alaska current-prediction station list (CO-OPS), flat
        // { id: { name, lat, lon } } — same shape as the tide stations, so it
        // feeds the map picker. Predictions are fetched without a bin, so
        // CO-OPS returns each station's default/reference bin.
        const response = await window.BoatSafe.http.get('./data/ak-current-stations.json', { skipCache: true, cacheTTL: 0 });
        this.currentStations = typeof response === 'string' ? JSON.parse(response) : response;
    }

    async initCurrentMap() {
        try {
            this.currentMap = new TideMap({
                container: this.currentMapContainer,
                stations: this.currentStations,
                onSelect: (id) => this.selectCurrentStation(id, 'map'),
                onViewChange: (ids) => this.updateCurrentDropdown(ids)
            });
            await this.currentMap.init();
        } catch (error) {
            // Map is an enhancement; the dropdown alone must stay usable
            console.error('Current map failed to initialize:', error);
            this.currentMap = null;
            if (this.currentMapContainer) this.currentMapContainer.style.display = 'none';
            if (this.currentMapControls) this.currentMapControls.style.display = 'none';
            this.updateCurrentDropdown(Object.keys(this.currentStations));
        }
    }

    restoreSavedCurrentStation() {
        try {
            const saved = localStorage.getItem('boatsafe_current_station');
            if (saved && this.currentStations[saved]) {
                this.selectCurrentStation(saved, 'restore');
            }
        } catch (error) {
            console.warn('Could not restore saved current station:', error);
        }
    }

    selectCurrentStation(id, source) {
        if (!this.currentStations[id]) return;
        this.currentCurrentStationId = id;
        try {
            localStorage.setItem('boatsafe_current_station', id);
        } catch (error) { /* private mode: selection just won't persist */ }

        if (this.currentMap) {
            this.currentMap.setSelected(id);
            if (source !== 'map') this.currentMap.focusStation(id);
        }
        if (![...this.currentDropdown.options].some(o => o.value === id)) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = this.currentStations[id].name;
            this.currentDropdown.insertBefore(option, this.currentDropdown.options[1] || null);
        }
        this.currentDropdown.value = id;

        this.loadCurrentData(id, this.currentsDate);
    }

    updateCurrentDropdown(visibleIds) {
        const selected = this.currentCurrentStationId;
        const ids = new Set(visibleIds);
        if (selected) ids.add(selected);

        const entries = [...ids].map(id => [id, this.currentStations[id].name]);
        entries.sort((a, b) => a[1].localeCompare(b[1]));

        this.currentDropdown.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = `Select a station (${visibleIds.length} in view)...`;
        this.currentDropdown.appendChild(placeholder);

        for (const [id, name] of entries) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = name;
            this.currentDropdown.appendChild(option);
        }
        this.currentDropdown.value = selected || '';
    }

    async initMap() {
        try {
            this.map = new TideMap({
                container: this.mapContainer,
                stations: this.tideStations,
                onSelect: (id) => this.selectTideStation(id, 'map'),
                onViewChange: (ids) => this.updateTideDropdown(ids)
            });
            await this.map.init();
        } catch (error) {
            // Map is an enhancement; the dropdown alone must stay usable
            console.error('Tide map failed to initialize:', error);
            this.map = null;
            this.mapContainer.style.display = 'none';
            if (this.mapControls) this.mapControls.style.display = 'none';
            this.updateTideDropdown(Object.keys(this.tideStations));
        }
    }

    restoreSavedStation() {
        try {
            const saved = localStorage.getItem('boatsafe_tide_station');
            if (saved && this.tideStations[saved]) {
                this.selectTideStation(saved, 'restore');
            }
        } catch (error) {
            console.warn('Could not restore saved tide station:', error);
        }
    }

    /* ---------------- Station selection & dropdown ---------------- */

    selectTideStation(id, source) {
        if (!this.tideStations[id]) return;
        this.currentTideStationId = id;
        try {
            localStorage.setItem('boatsafe_tide_station', id);
        } catch (error) { /* private mode: selection just won't persist */ }

        if (this.map) {
            this.map.setSelected(id);
            if (source !== 'map') this.map.focusStation(id);
        }
        // Make sure the dropdown reflects the selection even if the option
        // list hasn't been rebuilt for the current view yet
        if (![...this.tideDropdown.options].some(o => o.value === id)) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = this.tideStations[id].name;
            this.tideDropdown.insertBefore(option, this.tideDropdown.options[1] || null);
        }
        this.tideDropdown.value = id;

        this.loadTideData(id, this.tideDate);
    }

    updateTideDropdown(visibleIds) {
        const selected = this.currentTideStationId;
        const ids = new Set(visibleIds);
        if (selected) ids.add(selected);

        const entries = [...ids].map(id => [id, this.tideStations[id].name]);
        entries.sort((a, b) => a[1].localeCompare(b[1]));

        this.tideDropdown.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = `Select a station (${visibleIds.length} in view)...`;
        this.tideDropdown.appendChild(placeholder);

        for (const [id, name] of entries) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = name;
            this.tideDropdown.appendChild(option);
        }
        this.tideDropdown.value = selected || '';
    }

    setupEventListeners() {
        this.tideDropdown.addEventListener('change', (e) => {
            if (e.target.value) {
                this.selectTideStation(e.target.value, 'dropdown');
            }
        });

        if (this.mapControls) {
            this.mapControls.addEventListener('click', (e) => {
                const btn = e.target.closest('.map-region-btn');
                if (!btn || !this.map) return;
                this.mapControls.querySelectorAll('.map-region-btn')
                    .forEach(b => b.classList.toggle('active', b === btn));
                this.map.setRegion(btn.dataset.region);
            });
        }

        if (this.currentMapControls) {
            this.currentMapControls.addEventListener('click', (e) => {
                const btn = e.target.closest('.map-region-btn');
                if (!btn || !this.currentMap) return;
                this.currentMapControls.querySelectorAll('.map-region-btn')
                    .forEach(b => b.classList.toggle('active', b === btn));
                this.currentMap.setRegion(btn.dataset.region);
            });
        }

        if (this.currentDropdown) {
            this.currentDropdown.addEventListener('change', (e) => {
                if (e.target.value) {
                    this.selectCurrentStation(e.target.value, 'dropdown');
                }
            });
        }

        this.setupDateScroller(this.tideDateNav, 'tide');
        this.setupDateScroller(this.currentDateNav, 'currents');
    }

    /* ---------------- Tide data ---------------- */

    /**
     * Fetch one CO-OPS datagetter product. Called directly from the browser —
     * NOAA CO-OPS sends `Access-Control-Allow-Origin: *`, so no proxy is
     * needed and the app works as a static site. CO-OPS reports failures as
     * HTTP 200 with an `{ error: { message } }` body, so normalize that here.
     */
    async fetchCoops(params, cacheTTL) {
        const url = `${TidesCurrents.COOPS_BASE}?${new URLSearchParams(params).toString()}`;
        const res = await window.BoatSafe.http.get(url, { cacheTTL });
        const data = typeof res === 'string' ? JSON.parse(res) : res;
        if (data && data.error) {
            throw new Error(data.error.message || 'NOAA CO-OPS error');
        }
        return data;
    }

    async loadTideData(stationId, date = new Date()) {
        if (!this.tideStations[stationId]) return;
        this.showTideLoading();

        const dayMs = 24 * 3600 * 1000;
        const day = this.formatDateForAPI(date);
        const begin = this.formatDateForAPI(new Date(date.getTime() - dayMs));
        const end = this.formatDateForAPI(new Date(date.getTime() + dayMs));
        const base = {
            station: stationId, product: 'predictions', datum: 'MLLW',
            time_zone: 'lst_ldt', units: 'english', format: 'json'
        };

        try {
            // Predictions are stable astronomical values; cache 12h so a boat
            // that reconnects briefly keeps working offline afterward.
            const [hilo, curve] = await Promise.all([
                // 3-day hi/lo window lets the curve interpolate across midnight
                this.fetchCoops({ ...base, begin_date: begin, end_date: end, interval: 'hilo' }, 720),
                // 30-min curve for the day; subordinate stations reject intervals
                this.fetchCoops({ ...base, begin_date: day, end_date: day, interval: '30' }, 720)
                    .catch(() => null)
            ]);
            this.renderTideData(stationId, date, { data: hilo, curve });
        } catch (error) {
            console.error('Failed to load tide data:', error);
            this.showTideError('Tide data not available. Please try again later.');
        }
    }

    renderTideData(stationId, date, response) {
        const hiloPredictions = response?.data?.predictions;
        if (!hiloPredictions || hiloPredictions.length === 0) {
            this.showTideError('No tide data available for this station');
            return;
        }

        // hilo covers a 3-day window so the curve can be interpolated across
        // day boundaries; the list below shows only the selected day
        const allEvents = this.processTideData(hiloPredictions);
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
        const dayEvents = allEvents.filter(ev => ev.time >= dayStart && ev.time < dayEnd);

        if (dayEvents.length === 0) {
            this.showTideError('No tide events found for this date');
            return;
        }

        let curvePts = null;
        let interpolated = false;
        const curvePredictions = response?.curve?.predictions;
        if (Array.isArray(curvePredictions) && curvePredictions.length > 2) {
            curvePts = curvePredictions.map(p => ({
                t: this.parseNoaaTime(p.t),
                v: parseFloat(p.v)
            })).filter(p => p.t && !isNaN(p.v));
        }
        if (!curvePts || curvePts.length < 3) {
            // Subordinate stations only publish high/low predictions; a cosine
            // fit between consecutive events is the standard approximation
            curvePts = this.interpolateCurve(allEvents, dayStart, dayEnd);
            interpolated = true;
        }

        const stationName = this.tideStations[stationId].name;
        this.tideDataContainer.innerHTML = `
            <div class="station-header">
                <div class="station-name"></div>
                <div class="station-date">${this.formatDateDisplay(date)}</div>
            </div>
            <div class="tide-plot-wrap"></div>
            ${interpolated ? '<div class="tide-plot-note">Curve interpolated from high/low predictions</div>' : ''}
            <div class="tide-events">
                ${dayEvents.map(event => this.renderTideEvent(event)).join('')}
            </div>
        `;
        // Station names come from a data file, but never trust them in HTML
        this.tideDataContainer.querySelector('.station-name').textContent = stationName;

        if (curvePts && curvePts.length > 2) {
            this.buildTidePlot(
                this.tideDataContainer.querySelector('.tide-plot-wrap'),
                curvePts, dayEvents, dayStart, stationName
            );
        }
    }

    /**
     * SVG tide curve: single series, high/low direct labels, crosshair tooltip.
     */
    buildTidePlot(wrap, curvePts, dayEvents, dayStart, stationName) {
        const NS = 'http://www.w3.org/2000/svg';
        const W = 640, H = 250;
        const m = { l: 40, r: 14, t: 18, b: 26 };
        const plotW = W - m.l - m.r, plotH = H - m.t - m.b;
        const t0 = dayStart.getTime(), t1 = t0 + 24 * 3600 * 1000;

        const pts = curvePts.filter(p => p.t.getTime() >= t0 && p.t.getTime() <= t1);
        if (pts.length < 3) return;

        const values = pts.map(p => p.v).concat(dayEvents.map(ev => ev.height));
        let lo = Math.min(...values), hi = Math.max(...values);
        const pad = Math.max((hi - lo) * 0.1, 0.5);
        lo -= pad; hi += pad;
        const step = [0.5, 1, 2, 5, 10].find(s => (hi - lo) / s <= 6) || 10;
        lo = Math.floor(lo / step) * step;
        hi = Math.ceil(hi / step) * step;

        const x = (t) => m.l + ((t - t0) / (t1 - t0)) * plotW;
        const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * plotH;

        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svg.setAttribute('class', 'tide-plot');
        svg.setAttribute('tabindex', '0');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label',
            `Tide curve for ${stationName}: ` +
            dayEvents.map(ev =>
                `${ev.type} ${ev.height.toFixed(1)} feet at ${this.formatTime(ev.time)}`).join(', '));

        const add = (parent, tag, attrs, text) => {
            const el = document.createElementNS(NS, tag);
            for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
            if (text !== undefined) el.textContent = text;
            parent.appendChild(el);
            return el;
        };

        // Gridlines: recessive hairlines
        const grid = add(svg, 'g', { class: 'tide-plot-grid' });
        for (let v = lo; v <= hi + 1e-9; v += step) {
            add(grid, 'line', { x1: m.l, y1: y(v), x2: W - m.r, y2: y(v) });
            add(svg, 'text', {
                x: m.l - 6, y: y(v) + 3.5, 'text-anchor': 'end', class: 'tide-plot-axis'
            }, `${v} ft`);
        }
        for (let hr = 0; hr <= 24; hr += 6) {
            const tx = x(t0 + hr * 3600 * 1000);
            add(grid, 'line', { x1: tx, y1: m.t, x2: tx, y2: H - m.b });
            const label = hr === 0 || hr === 24 ? '12 AM' : hr === 12 ? '12 PM'
                : hr < 12 ? `${hr} AM` : `${hr - 12} PM`;
            add(svg, 'text', {
                x: tx, y: H - m.b + 15, 'text-anchor': hr === 0 ? 'start' : hr === 24 ? 'end' : 'middle',
                class: 'tide-plot-axis'
            }, label);
        }

        // Area wash + 2px line
        const coords = pts.map(p => `${x(p.t.getTime()).toFixed(1)},${y(p.v).toFixed(1)}`);
        add(svg, 'path', {
            class: 'tide-plot-area',
            d: `M${coords[0]}L${coords.join('L')}L${x(pts[pts.length - 1].t.getTime()).toFixed(1)},${(H - m.b).toFixed(1)}L${x(pts[0].t.getTime()).toFixed(1)},${(H - m.b).toFixed(1)}Z`
        });
        add(svg, 'path', { class: 'tide-plot-line', d: `M${coords.join('L')}` });

        // "Now" reference line (only meaningful when viewing today)
        const now = Date.now();
        if (now >= t0 && now <= t1) {
            add(svg, 'line', { class: 'tide-plot-now', x1: x(now), y1: m.t, x2: x(now), y2: H - m.b });
            add(svg, 'text', {
                x: x(now), y: m.t - 5, 'text-anchor': 'middle', class: 'tide-plot-now-label'
            }, 'Now');
        }

        // High/low markers with direct labels (the extremes are the story)
        for (const ev of dayEvents) {
            const ex = Math.min(Math.max(x(ev.time.getTime()), m.l + 26), W - m.r - 26);
            const ey = y(ev.height);
            add(svg, 'circle', { class: 'tide-plot-event', cx: x(ev.time.getTime()), cy: ey, r: 4.5 });
            const above = ev.type === 'high';
            add(svg, 'text', {
                x: ex, y: above ? ey - 18 : ey + 18, 'text-anchor': 'middle', class: 'tide-plot-event-value'
            }, `${ev.height.toFixed(1)} ft`);
            add(svg, 'text', {
                x: ex, y: above ? ey - 7 : ey + 29, 'text-anchor': 'middle', class: 'tide-plot-event-time'
            }, this.formatTime(ev.time));
        }

        // Crosshair + tooltip (hover and keyboard)
        const cross = add(svg, 'g', { class: 'tide-plot-cross', visibility: 'hidden' });
        const crossLine = add(cross, 'line', { y1: m.t, y2: H - m.b });
        const crossDot = add(cross, 'circle', { r: 4 });

        const tooltip = document.createElement('div');
        tooltip.className = 'tide-plot-tooltip';
        tooltip.hidden = true;
        const tipValue = document.createElement('strong');
        const tipTime = document.createElement('span');
        tooltip.appendChild(tipValue);
        tooltip.appendChild(tipTime);

        let idx = -1;
        const showIdx = (i) => {
            idx = Math.min(Math.max(i, 0), pts.length - 1);
            const p = pts[idx];
            const px = x(p.t.getTime()), py = y(p.v);
            crossLine.setAttribute('x1', px);
            crossLine.setAttribute('x2', px);
            crossDot.setAttribute('cx', px);
            crossDot.setAttribute('cy', py);
            cross.setAttribute('visibility', 'visible');
            tipValue.textContent = `${p.v.toFixed(1)} ft`;
            tipTime.textContent = this.formatTime(p.t);
            tooltip.hidden = false;
            const rect = svg.getBoundingClientRect();
            const fx = px / W * rect.width, fy = py / H * rect.height;
            tooltip.style.left = `${fx}px`;
            tooltip.style.top = `${fy}px`;
            tooltip.classList.toggle('flip', px > W * 0.72);
        };
        const hide = () => {
            cross.setAttribute('visibility', 'hidden');
            tooltip.hidden = true;
            idx = -1;
        };

        svg.addEventListener('pointermove', (e) => {
            const rect = svg.getBoundingClientRect();
            const sx = (e.clientX - rect.left) / rect.width * W;
            const t = t0 + (sx - m.l) / plotW * (t1 - t0);
            let best = 0, bestD = Infinity;
            for (let i = 0; i < pts.length; i++) {
                const d = Math.abs(pts[i].t.getTime() - t);
                if (d < bestD) { bestD = d; best = i; }
            }
            showIdx(best);
        });
        svg.addEventListener('pointerleave', hide);
        svg.addEventListener('focus', () => showIdx(Math.floor(pts.length / 2)));
        svg.addEventListener('blur', hide);
        svg.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') { showIdx(idx < 0 ? 0 : idx - 1); e.preventDefault(); }
            else if (e.key === 'ArrowRight') { showIdx(idx < 0 ? 0 : idx + 1); e.preventDefault(); }
            else if (e.key === 'Home') { showIdx(0); e.preventDefault(); }
            else if (e.key === 'End') { showIdx(pts.length - 1); e.preventDefault(); }
        });

        wrap.appendChild(svg);
        wrap.appendChild(tooltip);
    }

    /**
     * Cosine interpolation between consecutive high/low events. Exact only in
     * shape, not physics, but the accepted approximation when NOAA provides
     * no interval predictions (subordinate stations).
     */
    interpolateCurve(events, dayStart, dayEnd) {
        if (events.length < 2) return null;
        const stepMs = 20 * 60 * 1000;
        const pts = [];
        for (let t = dayStart.getTime(); t <= dayEnd.getTime(); t += stepMs) {
            let i = -1;
            for (let j = 0; j < events.length - 1; j++) {
                if (events[j].time.getTime() <= t && t < events[j + 1].time.getTime()) { i = j; break; }
            }
            if (i === -1) continue; // outside the 3-day hilo window edges
            const a = events[i], b = events[i + 1];
            const frac = (t - a.time.getTime()) / (b.time.getTime() - a.time.getTime());
            const v = a.height + (b.height - a.height) * (1 - Math.cos(Math.PI * frac)) / 2;
            pts.push({ t: new Date(t), v });
        }
        return pts;
    }

    processTideData(predictions) {
        if (!predictions || predictions.length === 0) return [];
        const events = [];
        predictions.forEach((prediction) => {
            const time = this.parseNoaaTime(prediction.t);
            const height = parseFloat(prediction.v);
            if (!time || isNaN(height)) return;
            events.push({
                time,
                height,
                type: prediction.type === 'H' ? 'high' : 'low'
            });
        });
        events.sort((a, b) => a.time - b.time);
        return events;
    }

    /** NOAA lst_ldt timestamps look like "2026-07-19 04:30" — parse explicitly
     *  because Safari rejects the space-separated form in new Date(). */
    parseNoaaTime(str) {
        if (typeof str !== 'string') return null;
        const match = str.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
        if (!match) return null;
        return new Date(+match[1], +match[2] - 1, +match[3], +match[4], +match[5]);
    }

    renderTideEvent(event) {
        const { time, height, type } = event;
        return `
            <div class="tide-event ${type}">
                <div class="event-type">${type === 'high' ? 'High' : 'Low'} Tide</div>
                <div class="event-time">${this.formatTime(time)}</div>
                <div class="event-value">${height.toFixed(1)} ft</div>
            </div>
        `;
    }

    /* ---------------- Currents (dropdown; only 8 stations) ---------------- */

    async loadCurrentData(stationId, date = new Date()) {
        if (!this.currentStations[stationId]) return;
        this.showCurrentLoading();
        const day = this.formatDateForAPI(date);
        try {
            const data = await this.fetchCoops({
                station: stationId, product: 'currents_predictions',
                time_zone: 'lst_ldt', units: 'english', format: 'json',
                interval: 'MAX_SLACK', begin_date: day, end_date: day
            }, 720);
            this.renderCurrentData(stationId, date, data);
        } catch (error) {
            console.error('Failed to load current data:', error);
            this.showCurrentError('Current data not available. Please try again later.');
        }
    }

    renderCurrentData(stationId, date, data) {
        // CO-OPS nests the array at current_predictions.cp — not the object
        // itself. (The old code treated the object as the array, so currents
        // threw on every load.)
        const predictions = data?.current_predictions?.cp ||
                            data?.currents_predictions?.cp ||
                            (Array.isArray(data?.current_predictions) ? data.current_predictions : null) ||
                            [];
        if (predictions.length === 0) {
            this.showCurrentError('No current predictions found');
            return;
        }

        const currentEvents = this.processCurrentData(predictions);
        if (currentEvents.length === 0) {
            this.showCurrentError('No current events found for this date');
            return;
        }

        this.currentDataContainer.innerHTML = `
            <div class="station-header">
                <div class="station-name">${this.currentStations[stationId].name}</div>
                <div class="station-date">${this.formatDateDisplay(date)}</div>
            </div>
            <div class="current-events">
                ${currentEvents.map(event => this.renderCurrentEvent(event)).join('')}
            </div>
        `;
    }

    processCurrentData(predictions) {
        if (!predictions || predictions.length === 0) return [];
        const events = [];
        predictions.forEach((prediction) => {
            const time = this.parseNoaaTime(prediction.Time) || new Date(prediction.Time);
            const velocity = prediction.Velocity_Major ? parseFloat(prediction.Velocity_Major) : 0;
            const type = (prediction.Type || 'unknown').toLowerCase();
            events.push({ time, velocity, type });
        });
        events.sort((a, b) => a.time - b.time);
        return events;
    }

    renderCurrentEvent(event) {
        const { time, velocity, type } = event;
        const typeDisplay = type === 'flood' ? 'Max Flood' :
                            type === 'ebb' ? 'Max Ebb' :
                            type === 'slack' ? 'Slack' : 'Current';
        const velocityDisplay = velocity > 0 ? `${velocity.toFixed(1)} kt` : 'Slack';
        return `
            <div class="current-event ${type}">
                <div class="event-type">${typeDisplay}</div>
                <div class="event-time">${this.formatTime(time)}</div>
                <div class="event-value">${velocityDisplay}</div>
            </div>
        `;
    }

    /* ---------------- Date navigation ---------------- */

    renderDateScrollers() {
        this.renderDateScroller(this.tideDateNav, this.tideDate);
        this.renderDateScroller(this.currentDateNav, this.currentsDate);
    }

    renderDateScroller(container, date) {
        if (!container) return;
        container.innerHTML = `
            <div class="date-navigation-controls">
                <button class="prev-day nav-button" title="Previous day">&#9664;</button>
                <span class="current-date">${this.formatDateDisplay(date)}</span>
                <button class="next-day nav-button" title="Next day">&#9654;</button>
                <button class="today-btn nav-button" title="Jump to today">Today</button>
            </div>
        `;
    }

    // Delegated click handling so the buttons can be re-rendered freely.
    setupDateScroller(container, which) {
        if (!container) return;
        container.addEventListener('click', (e) => {
            if (e.target.classList.contains('prev-day')) this.changeDate(which, -1);
            else if (e.target.classList.contains('next-day')) this.changeDate(which, 1);
            else if (e.target.classList.contains('today-btn')) this.changeDate(which, 0, true);
        });
    }

    changeDate(which, direction, toToday = false) {
        if (which === 'tide') {
            this.tideDate = toToday ? new Date() : this.addDays(this.tideDate, direction);
            this.renderDateScroller(this.tideDateNav, this.tideDate);
            if (this.currentTideStationId) this.loadTideData(this.currentTideStationId, this.tideDate);
        } else {
            this.currentsDate = toToday ? new Date() : this.addDays(this.currentsDate, direction);
            this.renderDateScroller(this.currentDateNav, this.currentsDate);
            if (this.currentCurrentStationId) this.loadCurrentData(this.currentCurrentStationId, this.currentsDate);
        }
    }

    addDays(date, n) {
        const d = new Date(date);
        d.setDate(d.getDate() + n);
        return d;
    }

    /* ---------------- Formatting & states ---------------- */

    formatTime(date) {
        if (!date) return 'Unknown';
        try {
            return new Date(date).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
        } catch (error) {
            return 'Unknown';
        }
    }

    formatDateForAPI(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }

    formatDateDisplay(date) {
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    showTideDefault() {
        this.tideDataContainer.innerHTML =
            '<div class="loading">Tap a station on the map or pick from the list to view tides</div>';
    }

    showCurrentDefault() {
        this.currentDataContainer.innerHTML = '<div class="loading">Select a current station to view data</div>';
    }

    showTideLoading() {
        this.tideDataContainer.innerHTML = '<div class="loading">Loading tide data...</div>';
    }

    showCurrentLoading() {
        this.currentDataContainer.innerHTML = '<div class="loading">Loading current data...</div>';
    }

    showTideError(message) {
        this.tideDataContainer.innerHTML = `
            <div class="status-message status-error">
                <strong>Error:</strong> ${message}
            </div>
        `;
    }

    showCurrentError(message) {
        this.currentDataContainer.innerHTML = `
            <div class="status-message status-error">
                <strong>Error:</strong> ${message}
            </div>
        `;
    }

    clear() {
        this.showTideDefault();
        this.showCurrentDefault();
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.TidesCurrents = TidesCurrents;
}
