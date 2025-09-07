const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = global.fetch || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

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

async function computeHash(ref, baseDir) {
  const cleanRef = ref.split(/[?#]/)[0];
  if (/^https?:\/\//i.test(cleanRef) || cleanRef.startsWith('//')) {
    const url = cleanRef.startsWith('//') ? `https:${cleanRef}` : cleanRef;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return crypto.createHash('sha384').update(buffer).digest('base64');
  }
  const target = cleanRef.startsWith('/')
    ? path.join(rootDir, cleanRef)
    : path.join(baseDir, cleanRef);
  const buffer = fs.readFileSync(target);
  return crypto.createHash('sha384').update(buffer).digest('base64');
}

async function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const tagRegex = /<(script|link)[^>]+>/gi;
  const failures = [];
  let tagMatch;
  while ((tagMatch = tagRegex.exec(content)) !== null) {
    const tag = tagMatch[0];
    const attrRegex = /([a-zA-Z0-9_-]+)=["']([^"']+)["']/g;
    const attrs = {};
    let attrMatch;
    while ((attrMatch = attrRegex.exec(tag)) !== null) {
      attrs[attrMatch[1]] = attrMatch[2];
    }
    const ref = attrs.src || attrs.href;
    const integrity = attrs.integrity;
    if (!ref || !integrity) {
      continue;
    }
    const parts = integrity.split(/\s+/);
    const sha384Part = parts.find(p => p.startsWith('sha384-'));
    if (!sha384Part) {
      failures.push(`${path.relative(rootDir, filePath)} -> ${ref} missing sha384`);
      continue;
    }
    const expected = sha384Part.split('-')[1];
    try {
      const actual = await computeHash(ref, path.dirname(filePath));
      if (actual !== expected) {
        failures.push(`${path.relative(rootDir, filePath)} -> ${ref}`);
      }
    } catch (err) {
      failures.push(`${path.relative(rootDir, filePath)} -> ${ref} (${err.message})`);
    }
  }
  return failures;
}

(async () => {
  const htmlFiles = getHtmlFiles(rootDir);
  const allFailures = [];
  for (const file of htmlFiles) {
    const failures = await checkFile(file);
    allFailures.push(...failures);
  }
  if (allFailures.length > 0) {
    console.error('Integrity mismatches:');
    for (const f of allFailures) {
      console.error(' -', f);
    }
    process.exit(1);
  } else {
    console.log('All integrity hashes match.');
  }
})();
