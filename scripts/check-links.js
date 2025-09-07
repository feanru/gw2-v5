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

function checkReferences(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const regex = /\b(?:src|href)=["']([^"']+)["']/gi;
  const baseDir = path.dirname(filePath);
  let match;

  while ((match = regex.exec(content)) !== null) {
    const ref = match[1];
    if (/^(https?:|mailto:|data:|javascript:|tel:|\/\/)/i.test(ref)) {
      continue;
    }
    if (ref.startsWith('#')) {
      continue;
    }
    const cleanRef = ref.split(/[?#]/)[0];
    const target = ref.startsWith('/')
      ? path.join(rootDir, cleanRef)
      : path.join(baseDir, cleanRef);
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

