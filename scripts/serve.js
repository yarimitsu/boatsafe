/**
 * Minimal zero-dependency static server for local preview.
 * Serves src/ over http so the app can fetch NOAA data (file:// can't).
 *
 * Usage: node scripts/serve.js [port]   (default 8000)
 * Then open the printed URL. Ctrl+C to stop.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src');
const PORT = parseInt(process.argv[2], 10) || 8000;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json'
};

http.createServer((req, res) => {
    // Strip query string, decode, and normalize
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    const filePath = path.join(ROOT, rel);

    // Block path traversal outside src/
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, buf) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found: ' + rel);
            return;
        }
        // No-cache so edits show on reload during development
        res.writeHead(200, {
            'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
            'Cache-Control': 'no-store'
        });
        res.end(buf);
    });
}).listen(PORT, () => {
    console.log(`Boat Safe preview running at http://localhost:${PORT}`);
    console.log('Serving src/  —  press Ctrl+C to stop');
});
