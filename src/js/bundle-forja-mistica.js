import fetchWithRetry from './utils/fetchWithRetry.js';
// Bundled forja mistica scripts
// Utilidades compartidas para fractales y forja mística
const iconCache = {};
const rarityCache = {};

async function fetchIconsFor(ids = []) {
  if (!ids.length) return;
  try {
    const res = await fetchWithRetry(`https://api.guildwars2.com/v2/items?ids=${ids.join(',')}&lang=es`);
    const data = await res.json();
    data.forEach(item => {
      if (item && item.id) {
        iconCache[item.id] = item.icon;
        rarityCache[item.id] = item.rarity;
      }
    });
  } catch {}
}

async function fetchItemPrices(ids = []) {
  if (!ids || ids.length === 0) return new Map();
  const url = `https://api.datawars2.ie/gw2/v1/items/csv?fields=id,buy_price,sell_price&ids=${ids.join(',')}`;
  try {
    const csv = await fetchWithRetry(url).then(r => r.text());
    const [header, ...rows] = csv.trim().split('\n');
    const headers = header.split(',');
    const idIdx = headers.indexOf('id');
    const buyIdx = headers.indexOf('buy_price');
    const sellIdx = headers.indexOf('sell_price');
    const result = new Map();
    rows.forEach(row => {
      const cols = row.split(',');
      const id = parseInt(cols[idIdx], 10);
      if (!isNaN(id)) {
        result.set(id, {
          buy_price: parseInt(cols[buyIdx], 10) || 0,
          sell_price: parseInt(cols[sellIdx], 10) || 0
        });
      }
    });
    return result;
  } catch (e) {
    return new Map();
  }
}

if (typeof window !== 'undefined') {
  window.FractalesUtils = { fetchIconsFor, fetchItemPrices, iconCache, rarityCache };
}


function addIconToCell(cell, icon) {
  if (!cell || !icon) return;
  const div = cell.querySelector('div');
  if (!div || div.querySelector('img')) return;
  const img = document.createElement('img');
  img.src = icon;
  img.className = 'item-icon';
  div.prepend(img);
}

const MATERIAL_IDS = {
  t6: {
    sangre: 24295,
    hueso: 24358,
    garra: 24351,
    colmillo: 24357,
    escama: 24289,
    totem: 24300,
    veneno: 24283
  },
  t5: {
    sangre: 24294,
    hueso: 24341,
    garra: 24350,
    colmillo: 24356,
    escama: 24288,
    totem: 24299,
    veneno: 24282
  },
  polvo: 24277,
  piedra: 20796
};

const LODESTONE_IDS = {
  cores: {
    glacial: 24319,
    cristal: 24329,
    destructor: 24324,
    cargado: 24304,
    corrupto: 24339,
    onice: 24309,
    fundido: 24314
  },
  stones: {
    glacial: 24320,
    cristal: 24330,
    destructor: 24325,
    cargado: 24305,
    corrupto: 24340,
    onice: 24310,
    fundido: 24315
  },
  polvo: 24277,
  botella: 19663,
  cristal: 20799
};

async function renderTablaForja() {
  const keys = Object.keys(MATERIAL_IDS.t5);
  const ids = [
    ...keys.map(k => MATERIAL_IDS.t5[k]),
    ...keys.map(k => MATERIAL_IDS.t6[k]),
    MATERIAL_IDS.polvo,
    MATERIAL_IDS.piedra
  ];
  const priceMap = await fetchItemPrices(ids);
  await fetchIconsFor(ids);

  keys.forEach(key => {
    const row = document.querySelector(`#matt5t6 tr[data-key="${key}"]`);
    if (!row) return;
    const sumEl = row.querySelector('.sum-mats');
    const resEl = row.querySelector('.resultado');
    const profitEl = row.querySelector('.profit');

    const precioT5 = priceMap.get(MATERIAL_IDS.t5[key])?.buy_price || 0;
    const precioT6Buy = priceMap.get(MATERIAL_IDS.t6[key])?.buy_price || 0;
    const precioT6Sell = priceMap.get(MATERIAL_IDS.t6[key])?.sell_price || 0;
    const precioPolvo = priceMap.get(MATERIAL_IDS.polvo)?.buy_price || 0;
    const precioPiedra = priceMap.get(MATERIAL_IDS.piedra)?.buy_price || 0;

    const sumMats = (50 * precioT5) + (5 * precioPolvo) + (5 * precioPiedra) + precioT6Buy;
    const resultadoBruto = 6.91 * precioT6Sell;
    const resultadoNeto = resultadoBruto * 0.85; // 15% comisión bazar
    const profit = resultadoNeto - sumMats;

    if (sumEl) sumEl.innerHTML = window.formatGoldColored(sumMats);
    if (resEl) resEl.innerHTML = window.formatGoldColored(resultadoNeto);
    if (profitEl) profitEl.innerHTML = window.formatGoldColored(profit);

    const cells = row.querySelectorAll('td');
    addIconToCell(cells[0], iconCache[MATERIAL_IDS.t5[key]]);
    addIconToCell(cells[1], iconCache[MATERIAL_IDS.t6[key]]);
    addIconToCell(cells[2], iconCache[MATERIAL_IDS.polvo]);
    addIconToCell(cells[3], iconCache[MATERIAL_IDS.piedra]);
  });
}

async function renderTablaLodestones() {
  const coreKeys = Object.keys(LODESTONE_IDS.cores);
  const ids = [
    ...coreKeys.map(k => LODESTONE_IDS.cores[k]),
    ...coreKeys.map(k => LODESTONE_IDS.stones[k]),
    LODESTONE_IDS.polvo,
    LODESTONE_IDS.botella,
    LODESTONE_IDS.cristal
  ];

  const priceMap = await fetchItemPrices(ids);
  await fetchIconsFor(ids);

  coreKeys.forEach(key => {
    const row = document.querySelector(`#tabla-lodestones tr[data-key="${key}"]`);
    if (!row) return;
    const sumEl = row.querySelector('.sum-mats');
    const profitEl = row.querySelector('.profit');

    const precioCore = priceMap.get(LODESTONE_IDS.cores[key])?.buy_price || 0;
    const precioLodestoneSell = priceMap.get(LODESTONE_IDS.stones[key])?.sell_price || 0;
    const precioPolvo = priceMap.get(LODESTONE_IDS.polvo)?.buy_price || 0;
    const precioBotella = priceMap.get(LODESTONE_IDS.botella)?.buy_price || 0;
    const precioCristal = priceMap.get(LODESTONE_IDS.cristal)?.buy_price || 0;

    const sumMats = (2 * precioCore) + precioPolvo + precioBotella + precioCristal;
    const resultadoNeto = precioLodestoneSell * 0.85; // comisión bazar 15%
    const profit = resultadoNeto - sumMats;

    if (sumEl) sumEl.innerHTML = window.formatGoldColored(sumMats);
    if (profitEl) profitEl.innerHTML = window.formatGoldColored(profit);

    const cells = row.querySelectorAll('td');
    addIconToCell(cells[0], iconCache[LODESTONE_IDS.cores[key]]);
    addIconToCell(cells[1], iconCache[LODESTONE_IDS.polvo]);
    addIconToCell(cells[2], iconCache[LODESTONE_IDS.botella]);
    addIconToCell(cells[3], iconCache[LODESTONE_IDS.cristal]);
    addIconToCell(cells[4], iconCache[LODESTONE_IDS.stones[key]]);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderTablaForja();
  renderTablaLodestones();
});
