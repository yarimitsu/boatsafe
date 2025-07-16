const fs = require('fs');
const path = require('path');
const { minify } = require('terser');
const CleanCSS = require('clean-css');

const buildDir = path.join(__dirname, '../dist');
const srcDir = path.join(__dirname, '../src');

// Clean and create build directory
if (fs.existsSync(buildDir)) {
  fs.rmSync(buildDir, { recursive: true });
}
fs.mkdirSync(buildDir, { recursive: true });

// Copy and minify HTML
const htmlContent = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf8');
fs.writeFileSync(path.join(buildDir, 'index.html'), htmlContent);

// Minify and bundle CSS
const cssFiles = [
  path.join(srcDir, 'css/main.css'),
  path.join(srcDir, 'css/widgets.css')
];

let combinedCSS = '';
cssFiles.forEach(file => {
  if (fs.existsSync(file)) {
    combinedCSS += fs.readFileSync(file, 'utf8') + '\n';
  }
});

const cleanCSS = new CleanCSS();
const minifiedCSS = cleanCSS.minify(combinedCSS);
fs.writeFileSync(path.join(buildDir, 'styles.min.css'), minifiedCSS.styles);

// Minify and bundle JavaScript
const jsFiles = [
  path.join(srcDir, 'js/utils/cache.js'),
  path.join(srcDir, 'js/utils/http.js'),
  path.join(srcDir, 'js/forecast-parser.js'),
  path.join(srcDir, 'js/widgets/location-selector.js'),
  path.join(srcDir, 'js/widgets/forecast-summary.js'),
  path.join(srcDir, 'js/widgets/discussion.js'),
  path.join(srcDir, 'js/widgets/alerts.js'),
  path.join(srcDir, 'js/widgets/tides.js'),
  path.join(srcDir, 'js/widgets/observations.js'),
  path.join(srcDir, 'js/app.js')
];

let combinedJS = '';
jsFiles.forEach(file => {
  if (fs.existsSync(file)) {
    combinedJS += fs.readFileSync(file, 'utf8') + '\n';
  }
});

minify(combinedJS).then(result => {
  fs.writeFileSync(path.join(buildDir, 'app.min.js'), result.code);
  console.log('Build completed successfully!');
}).catch(err => {
  console.error('Error minifying JavaScript:', err);
});

// Copy data files
const dataDir = path.join(buildDir, 'data');
fs.mkdirSync(dataDir, { recursive: true });
fs.copyFileSync(path.join(srcDir, 'data/zones.json'), path.join(dataDir, 'zones.json'));
fs.copyFileSync(path.join(srcDir, 'data/endpoints.json'), path.join(dataDir, 'endpoints.json'));

console.log('Build process started...');