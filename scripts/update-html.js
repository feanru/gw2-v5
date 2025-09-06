const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
const distVersionDir = path.join(rootDir, 'dist', version);

// SRI hashes for produced assets
const sriMap = {};
for (const hashed of Object.values(manifest)) {
  const assetPath = path.join(rootDir, hashed);
  if (fs.existsSync(assetPath)) {
    const buf = fs.readFileSync(assetPath);
    const sha256 = crypto.createHash('sha256').update(buf).digest('base64');
    const sha384 = crypto.createHash('sha384').update(buf).digest('base64');
    sriMap[hashed] = `sha256-${sha256} sha384-${sha384}`;
  }
}
// Also compute SRI for CSS files
const cssDir = path.join(rootDir, 'css');
if (fs.existsSync(cssDir)) {
  const cssFiles = fs.readdirSync(cssDir).filter(f => f.endsWith('.css'));
  for (const file of cssFiles) {
    const relPath = path.join('css', file);
    const buf = fs.readFileSync(path.join(rootDir, relPath));
    const sha256 = crypto.createHash('sha256').update(buf).digest('base64');
    const sha384 = crypto.createHash('sha384').update(buf).digest('base64');
    sriMap[relPath] = `sha256-${sha256} sha384-${sha384}`;
  }
}

// Rename source maps with version and optionally move them
const sourcemapTarget = process.env.SOURCE_MAP_TARGET || 'cdn';
if (fs.existsSync(distVersionDir)) {
  const mapFiles = fs.readdirSync(distVersionDir).filter(f => f.endsWith('.js.map'));
  for (const map of mapFiles) {
    const srcPath = path.join(distVersionDir, map);
    const versioned = map.replace(/\.js\.map$/, `.v${version}.js.map`);
    const targetDir = sourcemapTarget === 'cdn' ? distVersionDir : path.join(distVersionDir, 'sourcemaps');
    fs.mkdirSync(targetDir, { recursive: true });
    const destPath = path.join(targetDir, versioned);
    fs.renameSync(srcPath, destPath);
    // Update JS file to point to the renamed map
    const jsFile = path.join(distVersionDir, map.replace(/\.map$/, ''));
    if (fs.existsSync(jsFile)) {
      let jsContent = fs.readFileSync(jsFile, 'utf8');
      const mapRef = sourcemapTarget === 'cdn' ? versioned : `sourcemaps/${versioned}`;
      jsContent = jsContent.replace(/\/\/\# sourceMappingURL=[^\n]+/, `//# sourceMappingURL=${mapRef}`);
      fs.writeFileSync(jsFile, jsContent);
    }
  }
}

const htmlFiles = fs.readdirSync(rootDir).filter(f => f.endsWith('.html'));

for (const file of htmlFiles) {
  const filePath = path.join(rootDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let updated = content;
  for (const [original, hashed] of Object.entries(manifest)) {
    const isMin = original.endsWith('.min.js');
    const baseName = path.basename(original, isMin ? '.min.js' : '.js');
    const pattern = `/dist/(?:js|[^/]+)/${baseName}(?:\\.[\\w-]+)?${isMin ? '.min' : ''}\\.js`;
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
  // Add SRI attributes for scripts
  updated = updated.replace(/<script[^>]+src="([^"]+)"[^>]*><\/script>/g, (tag, src) => {
    const cleanSrc = src.split('?')[0];
    const integrity = sriMap[cleanSrc];
    if (integrity) {
      if (tag.includes('integrity=')) {
        tag = tag.replace(/integrity="[^"]*"/, `integrity="${integrity}"`);
      } else {
        tag = tag.replace('<script', `<script integrity="${integrity}" crossorigin="anonymous"`);
      }
    }
    return tag;
  });
  // Add SRI attributes for CSS links
  updated = updated.replace(/<link[^>]+href="([^"]+)"[^>]*>/g, (tag, href) => {
    const cleanHref = href.split('?')[0];
    const integrity = sriMap[cleanHref];
    if (integrity) {
      if (tag.includes('integrity=')) {
        tag = tag.replace(/integrity="[^"]*"/, `integrity="${integrity}"`);
      } else {
        tag = tag.replace('<link', `<link integrity="${integrity}" crossorigin="anonymous"`);
      }
    }
    return tag;
  });

  if (updated !== content) {
    fs.writeFileSync(filePath, updated);
  }
}
