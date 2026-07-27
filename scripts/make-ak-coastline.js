/**
 * Regenerate src/data/ak-coastline.json from Natural Earth 10m land polygons
 * (public domain). No deps: Sutherland-Hodgman bbox clip + Douglas-Peucker
 * simplify. The source file is NOT kept in the repo (~10 MB); download it from
 * https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson
 *
 * Usage: node scripts/make-ak-coastline.js <path-to-ne_10m_land.geojson> [tol] [minArea]
 */
const fs = require('fs');
const path = require('path');

const IN = process.argv[2];
if (!IN) {
  console.error('Usage: node scripts/make-ak-coastline.js <ne_10m_land.geojson> [tol] [minArea]');
  process.exit(1);
}
const OUT = path.join(__dirname, '../src/data/ak-coastline.json');

// Bbox in "Alaska-normalized" lons (west of antimeridian mapped to lon-360).
// Covers Dixon Entrance to Attu, plus a sliver of BC and Chukotka for context.
const BBOX = { lonMin: -190, lonMax: -129, latMin: 50.5, latMax: 72.5 };

function clipRing(ring, bbox) {
  // Sutherland-Hodgman against the 4 bbox half-planes
  const edges = [
    p => p[0] >= bbox.lonMin, // inside tests
    p => p[0] <= bbox.lonMax,
    p => p[1] >= bbox.latMin,
    p => p[1] <= bbox.latMax
  ];
  const intersect = (a, b, edgeIdx) => {
    const [x1, y1] = a, [x2, y2] = b;
    let t;
    if (edgeIdx === 0) t = (bbox.lonMin - x1) / (x2 - x1);
    else if (edgeIdx === 1) t = (bbox.lonMax - x1) / (x2 - x1);
    else if (edgeIdx === 2) t = (bbox.latMin - y1) / (y2 - y1);
    else t = (bbox.latMax - y1) / (y2 - y1);
    return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
  };
  let poly = ring;
  for (let e = 0; e < 4; e++) {
    const inside = edges[e];
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i];
      const prev = poly[(i + poly.length - 1) % poly.length];
      const curIn = inside(cur), prevIn = inside(prev);
      if (curIn) {
        if (!prevIn) out.push(intersect(prev, cur, e));
        out.push(cur);
      } else if (prevIn) {
        out.push(intersect(prev, cur, e));
      }
    }
    poly = out;
    if (poly.length === 0) return [];
  }
  return poly;
}

function perpDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function douglasPeucker(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(pts[i], pts[s], pts[e]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

function ringArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
}

function buildRings(tol, minArea) {
  const geo = JSON.parse(fs.readFileSync(IN, 'utf8'));
  const outRings = [];
  for (const f of geo.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates]
      : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
    for (const poly of polys) {
      const outer = poly[0]; // outer ring only; lakes are irrelevant here
      // Two passes: raw lons catch -180..-129, shifted (-360) catch +170..+180
      // (Aleutians/Chukotka beyond the antimeridian). A per-point shift would
      // distort segments crossing 0 deg; a uniform per-pass shift cannot.
      for (const shift of [0, -360]) {
        const ring = outer.map(([x, y]) => [x + shift, y]);
        const clipped = clipRing(ring, BBOX);
        if (clipped.length < 4) continue;
        const simplified = douglasPeucker(clipped, tol);
        if (simplified.length < 4) continue;
        if (ringArea(simplified) < minArea) continue;
        // flat [lon,lat,...] rounded to 3 decimals (~110 m / ~60 m at 60N)
        const flat = [];
        let px = null, py = null;
        for (const [x, y] of simplified) {
          const rx = Math.round(x * 1000) / 1000, ry = Math.round(y * 1000) / 1000;
          if (rx === px && ry === py) continue;
          flat.push(rx, ry);
          px = rx; py = ry;
        }
        if (flat.length >= 8) outRings.push(flat);
      }
    }
  }
  return outRings;
}

// Tune tolerance to land near the size budget
for (const [tol, minArea] of [[0.02, 0.003], [0.01, 0.002], [0.005, 0.001]]) {
  const rings = buildRings(tol, minArea);
  const json = JSON.stringify({ bbox: [BBOX.lonMin, BBOX.latMin, BBOX.lonMax, BBOX.latMax], rings });
  console.log(`tol=${tol} minArea=${minArea}: ${rings.length} rings, ${(json.length / 1024).toFixed(1)} KB`);
}

const CHOSEN_TOL = parseFloat(process.argv[3] || '0.01');
const CHOSEN_AREA = parseFloat(process.argv[4] || '0.002');
const rings = buildRings(CHOSEN_TOL, CHOSEN_AREA);
const json = JSON.stringify({ bbox: [BBOX.lonMin, BBOX.latMin, BBOX.lonMax, BBOX.latMax], rings });
fs.writeFileSync(OUT, json);
console.log(`WROTE tol=${CHOSEN_TOL}: ${rings.length} rings, ${(json.length / 1024).toFixed(1)} KB -> ${OUT}`);
