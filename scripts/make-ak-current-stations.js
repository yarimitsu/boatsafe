/**
 * Regenerate src/data/ak-current-stations.json from NOAA CO-OPS metadata.
 * Output is a flat { "<id>": { name, lat, lon } } map (same shape as
 * ak-tide-stations.json) so it drops straight into the TideMap picker.
 * Predictions are fetched later without a bin param (CO-OPS returns the
 * station's default/reference bin).
 *
 * Usage: node scripts/make-ak-current-stations.js
 * (Fetches https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=currentpredictions)
 */
const fs = require('fs');
const path = require('path');

// Station-id prefixes that are unambiguously Alaska (the "PCT" prefix mixes in
// British Columbia stations, so it is excluded): Southeast Alaska, Cook Inlet,
// Prince William Sound, Kodiak, Unimak & Aleutians.
const AK_PREFIXES = new Set(['SEA', 'COI', 'PWS', 'KOD', 'UNI']);

async function main() {
  const url = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=currentpredictions';
  const res = await fetch(url, { headers: { 'User-Agent': 'BoatSafe build' } });
  if (!res.ok) throw new Error(`mdapi HTTP ${res.status}`);
  const data = await res.json();
  const stations = data.stations || [];

  // Dedupe by station id (a station has one row per depth bin).
  const out = {};
  for (const s of stations) {
    if (!AK_PREFIXES.has(String(s.id).slice(0, 3)) || out[s.id]) continue;
    out[s.id] = { name: s.name, lat: s.lat, lon: s.lng };
  }

  const outPath = path.join(__dirname, '../src/data/ak-current-stations.json');
  fs.writeFileSync(outPath, JSON.stringify(out));
  const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`Wrote ${Object.keys(out).length} Alaska current stations -> ${outPath} (${kb} KB)`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
