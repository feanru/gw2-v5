const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

const htmlFiles = fs.readdirSync(rootDir).filter(f => f.endsWith('.html'));
const missing = [];

for (const htmlFile of htmlFiles) {
  const filePath = path.join(rootDir, htmlFile);
  const content = fs.readFileSync(filePath, 'utf8');
  const matches = content.match(/\/dist\/js\/[^"'\s)]+\.js[^"'\s)]*/g) || [];
  for (const ref of new Set(matches)) {
    const [cleanRef] = ref.split('?');
    const relative = cleanRef.replace(/^\//, '');
    const assetPath = path.join(rootDir, relative);
    if (!fs.existsSync(assetPath)) {
      missing.push(`${cleanRef} referenced in ${htmlFile}`);
    }
  }
}

if (missing.length > 0) {
  console.error('Missing JS assets:');
  for (const m of missing) {
    console.error(' -', m);
  }
  process.exit(1);
} else {
  console.log('All referenced JS assets exist.');
}
