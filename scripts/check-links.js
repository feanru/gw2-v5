const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

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

function checkRef(ref, filePath, baseDir) {
  if (/^(https?:|mailto:|data:|javascript:|tel:|\/\/)/i.test(ref)) {
    return;
  }
  if (ref.startsWith('#')) {
    return;
  }
  const cleanRef = ref.split(/[?#]/)[0];
  const target = ref.startsWith('/')
    ? path.join(rootDir, cleanRef)
    : path.join(baseDir, cleanRef);
  if (fs.existsSync(target)) {
    return;
  }
  if (fs.existsSync(`${target}.html`)) {
    return;
  }
  missing.push(`${path.relative(rootDir, filePath)} -> ${ref}`);
}

function checkReferences(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const baseDir = path.dirname(filePath);
  let match;

  const attrRegex = /\b(?:src|href)=["']([^"']+)["']/gi;
  while ((match = attrRegex.exec(content)) !== null) {
    checkRef(match[1], filePath, baseDir);
  }

  const workerRegex = /new\s+Worker\(\s*['"]([^'"\s]+)['"]/g;
  while ((match = workerRegex.exec(content)) !== null) {
    checkRef(match[1], filePath, baseDir);
  }

  const swRegex = /navigator\.serviceWorker\.register\(\s*['"]([^'"\s]+)['"]/g;
  while ((match = swRegex.exec(content)) !== null) {
    checkRef(match[1], filePath, baseDir);
  }

  const fetchRegex = /fetch\(\s*['"]([^'"\s]+?\.(?:json|js))['"]/g;
  while ((match = fetchRegex.exec(content)) !== null) {
    checkRef(match[1], filePath, baseDir);
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

