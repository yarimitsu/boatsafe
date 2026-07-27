/**
 * Regenerate src/data/ak-tide-stations.json from a full US tide-station dump.
 * The 429 KB source file this was built from (src/data/tide-stations.json,
 * keyed by station ID with name/region/lat/lon) has been deleted from the
 * repo since only the Alaska subset ships to the client; its provenance was
 * not recorded before deletion. To rebuild from scratch, source station
 * metadata (name, lat/lon) from NOAA's CO-OPS Metadata API, e.g.
 * https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions
 * and adapt the shape below; the ak-tide-stations.json output format is just
 * { "<stationId>": { "name", "lat", "lon" }, ... }.
 *
 * Usage (with a compatible source file present): node scripts/make-ak-tide-stations.js <path-to-source.json>
 */
const fs = require('fs');
const path = require('path');

const srcPath = process.argv[2];
if (!srcPath) {
  console.error('Usage: node scripts/make-ak-tide-stations.js <path-to-source.json>');
  console.error('See file header for the expected shape and a NOAA source to rebuild it from.');
  process.exit(1);
}
const outPath = path.join(__dirname, '../src/data/ak-tide-stations.json');

const all = JSON.parse(fs.readFileSync(srcPath, 'utf8'));

// The source dataset tags Alaska stations under six region labels; matching
// only 'Alaska' silently drops Juneau, Ketchikan, Anchorage, etc.
const AK_REGIONS = new Set(['Alaska', 'Southcentral Alaska', 'Southeast Alaska',
  'Western Alaska', 'Bering Sea', 'Arctic Alaska']);

const ak = {};
let missingCoords = 0;
for (const [id, s] of Object.entries(all)) {
  if (!AK_REGIONS.has(s.region)) continue;
  if (typeof s.lat !== 'number' || typeof s.lon !== 'number') {
    missingCoords++;
    console.warn(`Missing coords, skipped: ${id} ${s.name}`);
    continue;
  }
  ak[id] = { name: s.name, lat: s.lat, lon: s.lon };
}

fs.writeFileSync(outPath, JSON.stringify(ak));
const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
console.log(`Wrote ${Object.keys(ak).length} Alaska stations (${missingCoords} skipped) -> ${outPath} (${kb} KB)`);
