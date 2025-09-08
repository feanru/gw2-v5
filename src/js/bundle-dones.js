// Bundled dones tabs loader with dynamic imports

// Load core functions and expose them globally before loading the rest
const DonesCore = await import('./dones-core.js');
window.DonesCore = DonesCore;

// Load main dones logic after the core is ready
await import('./dones.js');

// Manejo de pestañas en dones.html
document.addEventListener('DOMContentLoaded', async function() {
  await import('./tabs.min.js');
  const loaded = {};

  function handleTab(tabId) {
    localStorage.setItem('activeDonTab', tabId);
    if (!loaded[tabId] && window.DonesPages) {
      loaded[tabId] = true;
      if (tabId === 'tab-don-suerte') window.DonesPages.loadSpecialDons();
      else if (tabId === 'tab-tributo-mistico') window.DonesPages.loadTributo();
      else if (tabId === 'tab-tributo-draconico') window.DonesPages.loadDraconicTribute();
      else if (tabId === 'dones-1ra-gen') window.DonesPages.loadDones1Gen();
    }
  }

  document.addEventListener('tabchange', e => {
    handleTab(e.detail.tabId);
  });

  const savedTab = localStorage.getItem('activeDonTab');
  const target = savedTab
    ? document.querySelector(`.tab-button[data-tab="${savedTab}"]`)
    : document.querySelector('.tab-button[data-tab]');
  if (target) target.click();
});

