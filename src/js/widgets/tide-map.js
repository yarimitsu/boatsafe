/**
 * TideMap - SVG tide-station picker for Alaska.
 * Self-contained by design: the coastline is a simplified Natural Earth asset
 * served from this origin, so the map costs no tile/CDN requests and keeps
 * working on weak cell connections once cached.
 */
class TideMap {
    constructor({ container, stations, onSelect, onViewChange }) {
        this.container = container;
        this.stations = stations;               // { id: { name, lat, lon } }
        this.onSelect = onSelect || (() => {});
        this.onViewChange = onViewChange || (() => {});

        this.svg = null;
        this.dotsGroup = null;
        this.labelsGroup = null;
        this.dots = new Map();                  // id -> circle element
        this.pos = new Map();                   // id -> [x, y] world coords
        this.selectedId = null;

        this.pointers = new Map();              // active pointers (pan/pinch)
        this.tapStart = null;                   // {x, y} client, to tell tap from drag
        this.commitTimer = null;
        this.rafPending = false;

        this.scale = 1;
        this.lonMin = 0;
        this.mercTop = 0;
        this.world = null;                      // full extent {x, y, w, h}
        this.view = null;                       // current viewBox rect
    }

    // Quick-zoom lat/lon boxes [lonMin, latMin, lonMax, latMax].
    // Lons west of the antimeridian are expressed as lon-360 so the
    // Aleutian chain stays in one piece.
    static REGIONS = {
        se: [-140.8, 54.4, -129.7, 60.2],   // includes Yakutat Bay
        sc: [-155.2, 56.3, -143.5, 61.7],
        sw: [-190.0, 50.8, -152.5, 58.4],   // includes Bristol Bay side of AK Pen
        nw: [-172.0, 58.5, -140.0, 71.9]
    };

    static normLon(lon) { return lon > 0 ? lon - 360 : lon; }

    static mercY(lat) {
        return -Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * (180 / Math.PI);
    }

    project(lon, lat) {
        return [
            (TideMap.normLon(lon) - this.lonMin) * this.scale,
            (TideMap.mercY(lat) - this.mercTop) * this.scale
        ];
    }

    // Fetch the coastline once and share it across all TideMap instances (the
    // tide map and the current map), so the 90 KB asset isn't pulled twice. It
    // never changes, so a long cache TTL is appropriate.
    static loadCoastline() {
        if (!TideMap._coastPromise) {
            TideMap._coastPromise = window.BoatSafe.http
                .get('./data/ak-coastline.json', { cacheTTL: 10080 }) // 7 days
                .then(c => (typeof c === 'string' ? JSON.parse(c) : c))
                .catch(err => {
                    console.warn('Coastline unavailable, showing stations only:', err);
                    TideMap._coastPromise = null; // allow a retry next map
                    return null;
                });
        }
        return TideMap._coastPromise;
    }

    async init() {
        const coast = await TideMap.loadCoastline();

        const bbox = coast?.bbox || [-190, 50.5, -129, 72.5];
        this.lonMin = bbox[0];
        this.mercTop = TideMap.mercY(bbox[3]);
        this.scale = 1000 / (bbox[2] - bbox[0]);
        const worldH = (TideMap.mercY(bbox[1]) - this.mercTop) * this.scale;
        this.world = { x: 0, y: 0, w: 1000, h: worldH };
        this.view = { ...this.world };

        this.buildSvg(coast);
        this.attachEvents();
        this.applyView();
        this.commit();
    }

    buildSvg(coast) {
        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label',
            'Map of Alaska tide stations. Pan and zoom to filter the station list below, or use the list directly.');
        svg.classList.add('tide-map-svg');

        if (coast?.rings) {
            const land = document.createElementNS(NS, 'g');
            land.setAttribute('class', 'map-land');
            const d = [];
            for (const ring of coast.rings) {
                const parts = [];
                for (let i = 0; i < ring.length; i += 2) {
                    const [x, y] = this.project(ring[i], ring[i + 1]);
                    parts.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
                }
                d.push(`M${parts.join('L')}Z`);
            }
            const path = document.createElementNS(NS, 'path');
            path.setAttribute('d', d.join(''));
            path.setAttribute('vector-effect', 'non-scaling-stroke');
            land.appendChild(path);
            svg.appendChild(land);
        }

        this.dotsGroup = document.createElementNS(NS, 'g');
        for (const [id, s] of Object.entries(this.stations)) {
            const [x, y] = this.project(s.lon, s.lat);
            this.pos.set(id, [x, y]);
            const c = document.createElementNS(NS, 'circle');
            c.setAttribute('cx', x.toFixed(1));
            c.setAttribute('cy', y.toFixed(1));
            c.setAttribute('class', 'map-station');
            this.dots.set(id, c);
            this.dotsGroup.appendChild(c);
        }
        svg.appendChild(this.dotsGroup);

        this.labelsGroup = document.createElementNS(NS, 'g');
        this.labelsGroup.setAttribute('class', 'map-labels');
        svg.appendChild(this.labelsGroup);

        this.container.appendChild(svg);
        this.svg = svg;
    }

    /** World units per screen pixel at the current view ('meet' letterboxing aware) */
    worldPerPx() {
        const cw = this.svg.clientWidth || 600;
        const ch = this.svg.clientHeight || 420;
        return 1 / Math.min(cw / this.view.w, ch / this.view.h);
    }

    clientToWorld(cx, cy) {
        const m = this.svg.getScreenCTM();
        if (!m) return [0, 0];
        const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
        return [p.x, p.y];
    }

    applyView() {
        const v = this.view;
        this.svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
        if (!this.rafPending) {
            this.rafPending = true;
            requestAnimationFrame(() => {
                this.rafPending = false;
                this.updateDotGeometry();
            });
        }
    }

    updateDotGeometry() {
        const wpp = this.worldPerPx();
        const r = (4.5 * wpp).toFixed(2);
        const rSel = (8 * wpp).toFixed(2);
        const sw = (1.5 * wpp).toFixed(2);
        for (const [id, c] of this.dots) {
            c.setAttribute('r', id === this.selectedId ? rSel : r);
            c.setAttribute('stroke-width', sw);
        }
    }

    clampView() {
        const v = this.view, w = this.world;
        v.w = Math.min(Math.max(v.w, w.w / 160), w.w * 1.15);
        v.h = v.w * (w.h / w.w);
        const mx = v.w * 0.5, my = v.h * 0.5; // allow half-view overshoot
        v.x = Math.min(Math.max(v.x, w.x - mx), w.x + w.w + mx - v.w);
        v.y = Math.min(Math.max(v.y, w.y - my), w.y + w.h + my - v.h);
    }

    zoomAt(wx, wy, factor) {
        const v = this.view;
        const newW = Math.min(Math.max(v.w * factor, this.world.w / 160), this.world.w * 1.15);
        const f = newW / v.w;
        v.x = wx - (wx - v.x) * f;
        v.y = wy - (wy - v.y) * f;
        v.w = newW;
        v.h = v.h * f;
        this.clampView();
        this.applyView();
        this.scheduleCommit();
    }

    panBy(dwx, dwy) {
        this.view.x += dwx;
        this.view.y += dwy;
        this.clampView();
        this.applyView();
        this.scheduleCommit();
    }

    setRegion(key) {
        if (key === 'all' || !TideMap.REGIONS[key]) {
            this.view = { ...this.world };
        } else {
            const [lonA, latA, lonB, latB] = TideMap.REGIONS[key];
            const [x1, y1] = this.project(lonA, latB); // top-left (max lat)
            const [x2, y2] = this.project(lonB, latA);
            // Fit box into the world aspect used by the viewBox
            const boxW = x2 - x1, boxH = y2 - y1;
            const aspect = this.world.h / this.world.w;
            let w = boxW, h = boxW * aspect;
            if (h < boxH) { h = boxH; w = h / aspect; }
            this.view = { x: x1 - (w - boxW) / 2, y: y1 - (h - boxH) / 2, w, h };
        }
        this.clampView();
        this.applyView();
        this.commit();
    }

    visibleStations() {
        const v = this.view;
        const ids = [];
        for (const [id, [x, y]] of this.pos) {
            if (x >= v.x && x <= v.x + v.w && y >= v.y && y <= v.y + v.h) ids.push(id);
        }
        return ids;
    }

    scheduleCommit() {
        clearTimeout(this.commitTimer);
        this.commitTimer = setTimeout(() => this.commit(), 180);
    }

    commit() {
        const ids = this.visibleStations();
        this.updateLabels(ids);
        this.updateDotGeometry();
        this.onViewChange(ids);
    }

    updateLabels(visibleIds) {
        while (this.labelsGroup.firstChild) this.labelsGroup.removeChild(this.labelsGroup.firstChild);
        // Labels only when sparse enough to stay legible
        if (visibleIds.length > 28 || this.view.w > this.world.w * 0.45) return;
        const NS = 'http://www.w3.org/2000/svg';
        const wpp = this.worldPerPx();
        for (const id of visibleIds) {
            const [x, y] = this.pos.get(id);
            const t = document.createElementNS(NS, 'text');
            t.setAttribute('x', (x + 8 * wpp).toFixed(1));
            t.setAttribute('y', (y + 4 * wpp).toFixed(1));
            t.setAttribute('font-size', (11 * wpp).toFixed(2));
            t.setAttribute('class', 'map-station-label');
            t.textContent = this.stations[id].name;
            this.labelsGroup.appendChild(t);
        }
    }

    setSelected(id) {
        if (this.selectedId && this.dots.has(this.selectedId)) {
            this.dots.get(this.selectedId).classList.remove('selected');
        }
        this.selectedId = id;
        const dot = this.dots.get(id);
        if (dot) {
            dot.classList.add('selected');
            // Raise above neighbors so the highlight is never buried
            this.dotsGroup.appendChild(dot);
        }
        this.updateDotGeometry();
    }

    focusStation(id) {
        const p = this.pos.get(id);
        if (!p) return;
        const v = this.view;
        const [x, y] = p;
        const inView = x >= v.x + v.w * 0.1 && x <= v.x + v.w * 0.9 &&
                       y >= v.y + v.h * 0.1 && y <= v.y + v.h * 0.9;
        if (inView) return;
        const w = Math.min(v.w, this.world.w / 8);
        const h = w * (this.world.h / this.world.w);
        this.view = { x: x - w / 2, y: y - h / 2, w, h };
        this.clampView();
        this.applyView();
        this.commit();
    }

    nearestStation(wx, wy, maxWorldDist) {
        let best = null, bestD = maxWorldDist * maxWorldDist;
        for (const [id, [x, y]] of this.pos) {
            const d = (x - wx) * (x - wx) + (y - wy) * (y - wy);
            if (d < bestD) { bestD = d; best = id; }
        }
        return best;
    }

    attachEvents() {
        const svg = this.svg;

        svg.addEventListener('pointerdown', (e) => {
            svg.setPointerCapture(e.pointerId);
            this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (this.pointers.size === 1) {
                this.tapStart = { x: e.clientX, y: e.clientY };
            } else {
                this.tapStart = null; // pinch is never a tap
            }
        });

        svg.addEventListener('pointermove', (e) => {
            if (!this.pointers.has(e.pointerId)) return;
            const prev = this.pointers.get(e.pointerId);
            const cur = { x: e.clientX, y: e.clientY };

            if (this.pointers.size === 1) {
                if (this.tapStart &&
                    Math.hypot(cur.x - this.tapStart.x, cur.y - this.tapStart.y) > 8) {
                    this.tapStart = null;
                }
                const [wx1, wy1] = this.clientToWorld(prev.x, prev.y);
                const [wx2, wy2] = this.clientToWorld(cur.x, cur.y);
                this.panBy(wx1 - wx2, wy1 - wy2);
            } else if (this.pointers.size === 2) {
                const ids = [...this.pointers.keys()];
                const other = this.pointers.get(ids[0] === e.pointerId ? ids[1] : ids[0]);
                const prevDist = Math.hypot(prev.x - other.x, prev.y - other.y);
                const curDist = Math.hypot(cur.x - other.x, cur.y - other.y);
                const prevMid = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 };
                const curMid = { x: (cur.x + other.x) / 2, y: (cur.y + other.y) / 2 };
                const [pwx, pwy] = this.clientToWorld(prevMid.x, prevMid.y);
                const [cwx, cwy] = this.clientToWorld(curMid.x, curMid.y);
                this.panBy(pwx - cwx, pwy - cwy);
                if (curDist > 0 && prevDist > 0) {
                    const [ax, ay] = this.clientToWorld(curMid.x, curMid.y);
                    this.zoomAt(ax, ay, prevDist / curDist);
                }
            }
            this.pointers.set(e.pointerId, cur);
        });

        const endPointer = (e) => {
            if (this.pointers.size === 1 && this.tapStart) {
                const [wx, wy] = this.clientToWorld(e.clientX, e.clientY);
                // Hit target is generous (26 px), not just the painted dot
                const id = this.nearestStation(wx, wy, 26 * this.worldPerPx());
                if (id) this.onSelect(id);
            }
            this.pointers.delete(e.pointerId);
            this.tapStart = null;
        };
        svg.addEventListener('pointerup', endPointer);
        svg.addEventListener('pointercancel', (e) => {
            this.pointers.delete(e.pointerId);
            this.tapStart = null;
        });

        svg.addEventListener('wheel', (e) => {
            e.preventDefault();
            const [wx, wy] = this.clientToWorld(e.clientX, e.clientY);
            this.zoomAt(wx, wy, e.deltaY > 0 ? 1.25 : 0.8);
        }, { passive: false });

        svg.addEventListener('dblclick', (e) => {
            e.preventDefault();
            const [wx, wy] = this.clientToWorld(e.clientX, e.clientY);
            this.zoomAt(wx, wy, 0.5);
        });

        window.addEventListener('resize', () => this.scheduleCommit());
    }
}

if (typeof window !== 'undefined') {
    window.TideMap = TideMap;
}
