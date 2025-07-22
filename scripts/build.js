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

// Copy and update HTML paths for production
let htmlContent = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf8');

// Replace CSS links with minified version
htmlContent = htmlContent.replace(
  /<link rel="stylesheet" href="css\/main\.css">\s*<link rel="stylesheet" href="css\/widgets\.css">/,
  '<link rel="stylesheet" href="styles.min.css">'
);

// Replace multiple script tags with single minified bundle
const scriptReplace = htmlContent.match(/<!-- JavaScript -->\s*([\s\S]*?)(<\/body>)/);
if (scriptReplace) {
  htmlContent = htmlContent.replace(
    scriptReplace[1],
    '\n    <script src="app.min.js"></script>\n    '
  );
}

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
  path.join(srcDir, 'js/widgets/weather.js'),
  path.join(srcDir, 'js/widgets/seak-observations.js'),
  path.join(srcDir, 'js/widgets/coastal-forecast.js'),
  path.join(srcDir, 'js/widgets/tides-currents.js'),
  path.join(srcDir, 'js/widgets/currents.js'),
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
fs.copyFileSync(path.join(srcDir, 'data/tide-stations.json'), path.join(dataDir, 'tide-stations.json'));
fs.copyFileSync(path.join(srcDir, 'data/seak-stations.json'), path.join(dataDir, 'seak-stations.json'));
fs.copyFileSync(path.join(srcDir, 'data/current-stations.json'), path.join(dataDir, 'current-stations.json'));
fs.copyFileSync(path.join(srcDir, 'data/coastal-stations.json'), path.join(dataDir, 'coastal-stations.json'));

// Copy logo image
fs.copyFileSync(path.join(srcDir, 'oceanbightlogo.png'), path.join(buildDir, 'oceanbightlogo.png'));

// Copy manifest.json
fs.copyFileSync(path.join(srcDir, 'manifest.json'), path.join(buildDir, 'manifest.json'));

console.log('Build process started...');
