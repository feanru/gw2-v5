const fetch = global.fetch || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));
const { execSync } = require('child_process');

const zone = process.env.CLOUDFLARE_ZONE_ID;
const token = process.env.CLOUDFLARE_TOKEN;
const baseUrl = process.env.CLOUDFLARE_BASE_URL;

if (!zone || !token || !baseUrl) {
  console.error('CLOUDFLARE_ZONE_ID, CLOUDFLARE_TOKEN and CLOUDFLARE_BASE_URL env vars are required');
  process.exit(1);
}

let urls = [];
try {
  const prevManifestRaw = execSync('git show HEAD^:dist/manifest.json', { encoding: 'utf8' });
  const prevManifest = JSON.parse(prevManifestRaw);
  urls = [...new Set(Object.values(prevManifest))].map((p) => `${baseUrl.replace(/\/$/, '')}${p}`);
} catch (e) {
  console.warn('Previous manifest not found, purging everything');
}

const payload = urls.length > 0 ? { files: urls } : { purge_everything: true };

fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify(payload),
})
  .then((r) => r.json())
  .then((res) => {
    if (!res.success) {
      console.error('CDN purge failed', res.errors);
      process.exit(1);
    }
    console.log(
      payload.purge_everything ? 'CDN cache purged (everything)' : `Purged ${urls.length} paths from previous version`
    );
  })
  .catch((err) => {
    console.error('CDN purge failed', err);
    process.exit(1);
  });
