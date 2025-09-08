window.addEventListener('DOMContentLoaded', async () => {
  try {
    const manifest = await fetch('/dist/manifest.json').then(r => r.json());
    const path = manifest['/dist/js/bundle-auth-nav.min.js'];
    if (path) {
      await import(`${path}?v=${window.__APP_VERSION__}`);
    }
  } catch (e) {
    console.error('Error loading auth module', e);
  }
});
