const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
let manifest = {};
try {
  manifest = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'dist', 'manifest.json'), 'utf8')
  );
} catch {}

function getHtmlFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') {
        continue;
      }
      files.push(...getHtmlFiles(path.join(dir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

function verifyReference(ref, baseDir, filePath) {
  if (/^(https?:|mailto:|data:|javascript:|tel:|\/\/)/i.test(ref)) {
    return;
  }
  if (ref.startsWith('#')) {
    return;
  }
  const cleanRef = ref.split(/[?#]/)[0];
  const resolved = cleanRef.startsWith('/')
    ? path.join(rootDir, cleanRef.slice(1))
    : path.join(baseDir, cleanRef);
  let target = resolved;
  if (!fs.existsSync(target)) {
    const mapped = manifest[cleanRef];
    if (mapped) {
      target = path.join(rootDir, mapped);
    }
  }
  try {
    fs.accessSync(target);
  } catch {
    const withHtml = `${target}.html`;
    try {
      fs.accessSync(withHtml);
    } catch {
      missing.push(`${path.relative(rootDir, filePath)} -> ${ref}`);
    }
  }
}

function checkReferences(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const baseDir = path.dirname(filePath);
  const patterns = [
    /\b(?:src|href)=["']([^"']+)["']/gi,
    /new\s+Worker\(\s*["']([^"']+)["']\s*\)/gi,
    /navigator\.serviceWorker\.register\(\s*["']([^"']+)["']\s*\)/gi,
    /fetch\(\s*["']([^"']+)["']\s*\)/gi,
  ];

  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      const ref = match[1];
      if (regex === patterns[3]) {
        const clean = ref.split(/[?#]/)[0];
        if (!clean.endsWith('.json') && !clean.endsWith('.js')) {
          continue;
        }
      }
      verifyReference(ref, baseDir, filePath);
    }
  }
}

const htmlFiles = getHtmlFiles(rootDir);
const missing = [];

for (const file of htmlFiles) {
  checkReferences(file);
}

if (missing.length > 0) {
  console.error('Missing references:');
  for (const m of missing) {
    console.error(' -', m);
  }
  process.exit(1);
} else {
  console.log('All referenced files exist.');
}

