const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, '..', 'dist', 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('Manifest file not found:', manifestPath);
  process.exit(1);
}

const versionFile = path.join(__dirname, '..', 'version.txt');
let version = '0';
try {
  version = fs.readFileSync(versionFile, 'utf8').trim();
} catch (e) {
  console.warn('Version file not found:', versionFile);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const rootDir = path.join(__dirname, '..');
const htmlFiles = fs.readdirSync(rootDir).filter(f => f.endsWith('.html'));

for (const file of htmlFiles) {
  const filePath = path.join(rootDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let updated = content;
  for (const [original, hashed] of Object.entries(manifest)) {
    const isMin = original.endsWith('.min.js');
    const baseName = path.basename(original, isMin ? '.min.js' : '.js');
    const pattern = `/dist/(?:js|v[^/]+)/${baseName}(?:\\.[\\w-]+)?${isMin ? '.min' : ''}\\.js`;
    const regex = new RegExp(pattern, 'g');
    updated = updated.replace(regex, `${hashed}?v=${version}`);
  }
  // Append version to CSS references
  updated = updated.replace(/(href="css\/[^"]+\.css)(\?v=[^"']*)?"/g, `$1?v=${version}"`);
  const metaTag = `<meta name="app-version" content="${version}">`;
  const versionScript = `<script>window.__APP_VERSION__='${version}';</script>`;
  if (!updated.includes('name="app-version"')) {
    updated = updated.replace(/<head>/i, `<head>\n  ${metaTag}\n  ${versionScript}`);
  } else {
    updated = updated.replace(/<meta name="app-version" content="[^"]*">/, metaTag);
    updated = updated.replace(/window.__APP_VERSION__='[^']*';/, `window.__APP_VERSION__='${version}';`);
  }
  if (updated !== content) {
    fs.writeFileSync(filePath, updated);
  }
}
