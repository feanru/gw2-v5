// search-modal-core.js
// Funciones base reutilizables para el modal de búsqueda

// Endpoints para obtener la lista de ítems
const API_URL_JSON = 'https://api.datawars2.ie/gw2/v1/items/json?fields=id,name_es';
const API_URL_CSV = 'https://api.datawars2.ie/gw2/v1/items/csv?fields=buy_price,sell_price,buy_quantity,sell_quantity,last_updated,1d_buy_sold,1d_sell_sold,2d_buy_sold,2d_sell_sold,7d_buy_sold,7d_sell_sold,1m_buy_sold,1m_sell_sold';
import { requestItems } from './utils/requestManager.js';
import fetchWithRetry from './utils/fetchWithRetry.js';

function initSearchModal(options = {}) {
  const {
    onSelect = function(id) {},
    formatPrice = null,
    useSuggestions = false
  } = options;

  const searchInput = document.getElementById('modal-search-input');
  const suggestionsEl = document.getElementById('modal-suggestions');
    const resultsEl = document.getElementById('modal-results');
    const modalSkeleton = document.getElementById('modal-skeleton');
  const errorMessage = document.getElementById('modal-error-message');

  let allItems = [];
  const iconCache = {};
  const rarityCache = {};

  function toggleModalSkeleton(show) {
    if (modalSkeleton) modalSkeleton.classList.toggle('hidden', !show);
  }
  function showError(msg) {
    if (!errorMessage) return;
    errorMessage.textContent = msg;
    errorMessage.style.display = 'block';
  }
  function hideError() {
    if (errorMessage) errorMessage.style.display = 'none';
  }

  async function fetchAllItems() {
    const cached = sessionStorage.getItem('itemList');
    if (cached) {
      allItems = JSON.parse(cached);
      return;
    }
    hideError();
    try {
      const [resJson, resCsv] = await Promise.all([
        fetchWithRetry(API_URL_JSON),
        fetchWithRetry(API_URL_CSV)
      ]);
      const [itemsJson, csvText] = await Promise.all([
        resJson.json(),
        resCsv.text()
      ]);
      const lines = csvText.trim().split('\n');
      const headers = lines[0].split(',');
      const itemsCsv = lines.slice(1).map(line => {
        const values = line.split(',');
        const obj = {};
        headers.forEach((h, i) => {
          if (h === 'last_updated') {
            obj[h] = values[i] || '-';
          } else if (h === 'buy_price' || h === 'sell_price') {
            obj[h] = values[i] !== '' ? parseInt(values[i], 10) : null;
          } else {
            obj[h] = values[i] !== '' ? parseInt(values[i], 10) : null;
          }
        });
        return obj;
      });
      const csvById = {};
      itemsCsv.forEach(item => { csvById[Number(item.id)] = item; });
      allItems = itemsJson.map(item => ({
        ...item,
        ...(csvById[Number(item.id)] || {})
      }));
      sessionStorage.setItem('itemList', JSON.stringify(allItems));
    } catch (e) {
      showError('No se pudieron cargar los ítems.');
    }
  }

  function renderSuggestions(matches) {
    if (!useSuggestions) {
      if (suggestionsEl) {
        suggestionsEl.innerHTML = '';
        suggestionsEl.style.display = 'none';
      }
      return;
    }
    if (!suggestionsEl) return;
    suggestionsEl.innerHTML = '';
    if (!matches.length) {
      suggestionsEl.style.display = 'none';
      return;
    }
    const frag = document.createDocumentFragment();
    matches.forEach(item => {
      const li = document.createElement('li');
      li.textContent = item.name_es;
      li.onclick = () => onSelect(item.id);
      frag.appendChild(li);
    });
    suggestionsEl.appendChild(frag);
    suggestionsEl.style.display = 'block';
  }

  function renderResults(items, showNoResults = false) {
    if (!resultsEl) return;
    resultsEl.innerHTML = '';
    if (!items.length && showNoResults) {
      resultsEl.innerHTML = '<div class="error-message">No se encontraron ítems.</div>';
      return;
    }
    const fragment = document.createDocumentFragment();
    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.onclick = (e) => onSelect(item.id, e);
      const rarityClass = typeof getRarityClass === 'function'
          ? getRarityClass(rarityCache[item.id])
          : '';
      const buy = formatPrice ? formatPrice(item.buy_price) : (item.buy_price || 0);
      const sell = formatPrice ? formatPrice(item.sell_price) : (item.sell_price || 0);
      card.innerHTML = `
      <img src="${iconCache[item.id] || ''}" alt=""/>
      <div class="item-name ${rarityClass}">${item.name_es}</div>
      <div class="item-price" style="display:none;">Compra: ${buy} | Venta: ${sell}</div>
    `;
      fragment.appendChild(card);
    });
    resultsEl.appendChild(fragment);
  }

  function debounce(fn, ms) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  async function fetchIconsFor(ids) {
    if (!ids.length) return;
    try {
      const data = await requestItems(ids);
      data.forEach(item => {
        if (!item) return;
        iconCache[item.id] = item.icon;
        rarityCache[item.id] = item.rarity;
      });
    } catch {}
  }

  function normalizeStr(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  if (searchInput) {
    searchInput.addEventListener('input', debounce(async function() {
      const value = this.value.trim().toLowerCase();
      if (value.length < 3) {
        if (useSuggestions && suggestionsEl) suggestionsEl.style.display = 'none';
        if (resultsEl) resultsEl.innerHTML = '';
        toggleModalSkeleton(false);
        return;
      }
      toggleModalSkeleton(true);
      const normalValue = normalizeStr(value);
      let matches = allItems.filter(item => item.name_es && normalizeStr(item.name_es).includes(normalValue));
      matches = matches.slice(0, 30);
      const missingIcons = matches.filter(i => !iconCache[i.id]).map(i => i.id);
      if (missingIcons.length) await fetchIconsFor(missingIcons);
      toggleModalSkeleton(false);
      renderSuggestions(matches);
      renderResults(matches, true);
    }, 250));
  }

  (async function init() {
    toggleModalSkeleton(true);
    await fetchAllItems();
    renderResults([]);
    toggleModalSkeleton(false);
  })();
}

if (typeof window !== 'undefined') {
  window.initSearchModal = initSearchModal;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports.initSearchModal = initSearchModal;
}

