const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, '..', 'dist', 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('Manifest file not found:', manifestPath);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const rootDir = path.join(__dirname, '..');
const htmlFiles = fs.readdirSync(rootDir).filter(f => f.endsWith('.html'));

for (const file of htmlFiles) {
  const filePath = path.join(rootDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let updated = content;
  for (const [original, hashed] of Object.entries(manifest)) {
    const regex = new RegExp(original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    updated = updated.replace(regex, hashed);
  }
  if (updated !== content) {
    fs.writeFileSync(filePath, updated);
  }
}
