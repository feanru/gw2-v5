import { showSkeleton, hideSkeleton } from './ui-helpers.js';
import { restoreCraftIngredientPrototypes } from './items-core.js';

// Always obtain the latest core reference rather than using a stale destructure
function getCore() { return window.DonesCore || {}; }
// js/dones.js

// Sección de "Dones Especiales" (ejemplo: Don de la Suerte)
// Puedes agregar más dones en el array DONES si lo deseas

var DONES = [
  {
    id: 19673, // ID real para Don de la Magia
    name: "Don de la Magia",
    mainIngredients: [
      { id: 19675, name: "Trébol místico", type: "account_bound", count: 77, components: [
  { id: 19976, name: "Moneda mística", count: 250 },
  { id: 19721, name: "Pegote de ectoplasma", count: 250 },
  { id: 19925, name: "Esquirla de obsidiana", count: 250 },
  { id: 20796, name: "Piedra filosofal", count: 1500 }
]},
      { id: 19721, name: "Pegote de ectoplasma", count: 250 }
    ],
    manualIngredients: [
      { id: 24295, name: "Vial de sangre poderosa", count: 250 },
      { id: 24283, name: "Vesícula de veneno poderoso", count: 250 },
      { id: 24300, name: "Tótem elaborado", count: 250 },
      { id: 24277, name: "Montón de polvo cristalino", count: 250 },
    ]
  },
  {
    id: 19672, // ID real para Don del Poder
    name: "Don del Poder",
    manualIngredients: [
      { id: 24357, name: "Colmillo feroz", count: 250 },
      { id: 24289, name: "Escama blindada", count: 250 },
      { id: 24351, name: "Garra despiadada", count: 250 },
      { id: 24358, name: "Hueso antiguo", count: 250 },
    ]
  },
  {
    id: 19626,
    name: "Don de la Suerte",
    mainIngredients: [
      { id: 19721, name: "Pegote de ectoplasma", count: 250 },
      {
        id: 19675,
        name: "Trébol místico",
        type: "account_bound",
        count: 77,
        components: [
          { id: 19976, name: "Moneda mística", count: 250 },
          { id: 19721, name: "Pegote de ectoplasma", count: 250 },
          { id: 19925, name: "Esquirla de obsidiana", count: 250 },
          { id: 20796, name: "Piedra filosofal", count: 1500 }
        ]
      },
      {
        id: 19673,
        name: "Don de la Magia",
        type: "crafting_material",
        count: 1,
        components: [
          { id: 24295, name: "Vial de sangre poderosa", count: 250 },
          { id: 24283, name: "Vesícula de veneno poderoso", count: 250 },
          { id: 24300, name: "Tótem elaborado", count: 250 },
          { id: 24277, name: "Montón de polvo cristalino", count: 250 }
        ]
      },
      {
        id: 19672,
        name: "Don del Poder",
        type: "crafting_material",
        count: 1,
        components: [
          { id: 24351, name: "Colmillo feroz", count: 250 },
          { id: 24289, name: "Escama blindada", count: 250 },
          { id: 24357, name: "Garra despiadada", count: 250 },
          { id: 24358, name: "Hueso antiguo", count: 250 }
        ]
      }
    ]
  }
];

const API_ITEM = "https://api.guildwars2.com/v2/items/";
const API_PRICES = "https://api.guildwars2.com/v2/commerce/prices/";

const donesContent = document.getElementById('dones-content');
const donesSkeleton = document.getElementById('dones-skeleton');
const errorMsg = document.getElementById('error-message');

window.showSkeleton = showSkeleton;
window.hideSkeleton = hideSkeleton;


// --- Fin de formatGold ---

// IDs de ítems no comerciables o con precios especiales que deben saltarse
// Items con precio fijo manual
const FIXED_PRICE_ITEMS = {
  19676: 10000 // Piedra rúnica helada: 1 oro (10000 cobre)
};

const EXCLUDED_ITEM_IDS = [
  19675, // Trébol místico (account bound)
  19925, // Esquirla de obsidiana (precio especial)
  20796, // Piedra filosofal (precio especial)
  20799, // Cristal místico (no comerciable)
  19665, // Don del noble (account bound)
  19674, // Don del dominio (account bound)
  19626, // Don de la suerte (crafting, sin precio directo)
  19672, // Don del poder
  19673, // Don de la magia
  19645, 19650, 19655, 19639, 19635, 19621 // Diversos "Don de ..." (account bound)
];
let donesWorkerInstance = null;
let costsWorkerInstance = null;

function runDonesWorker(rootIngredients) {
  if (!donesWorkerInstance) {
    donesWorkerInstance = new Worker(new URL('./workers/donesWorker.js', import.meta.url), { type: 'module' });
  }
  return new Promise((resolve, reject) => {
    const handleMessage = (e) => {
      donesWorkerInstance.removeEventListener('message', handleMessage);
      donesWorkerInstance.removeEventListener('error', handleError);
      resolve(e.data);
    };
    const handleError = (err) => {
      donesWorkerInstance.removeEventListener('message', handleMessage);
      donesWorkerInstance.removeEventListener('error', handleError);
      // Show a clear message for worker failures
      errorMsg.innerText = `Error del Worker: ${err.message || 'Fallo inesperado.'}`;
      errorMsg.style.display = 'block';
      // Reset the worker so future calls create a fresh instance
      try {
        donesWorkerInstance.terminate();
      } catch {}
      donesWorkerInstance = null;
      reject(err);
    };
    donesWorkerInstance.addEventListener('message', handleMessage);
    donesWorkerInstance.addEventListener('error', handleError);
    donesWorkerInstance.postMessage({ rootIngredients });
  });
}

function runCostsWorker(ingredientTree, globalQty) {
  if (!costsWorkerInstance) {
    costsWorkerInstance = new Worker(new URL('./workers/costsWorker.js', import.meta.url), { type: 'module' });
  }
  return new Promise((resolve, reject) => {
    const handleMessage = (e) => {
      costsWorkerInstance.removeEventListener('message', handleMessage);
      costsWorkerInstance.removeEventListener('error', handleError);
      resolve(e.data);
    };
    const handleError = (err) => {
      costsWorkerInstance.removeEventListener('message', handleMessage);
      costsWorkerInstance.removeEventListener('error', handleError);
      // Provide feedback and reset the worker on errors
      errorMsg.innerText = `Error del Worker: ${err.message || 'Fallo inesperado.'}`;
      errorMsg.style.display = 'block';
      try {
        costsWorkerInstance.terminate();
      } catch {}
      costsWorkerInstance = null;
      reject(err);
    };
    costsWorkerInstance.addEventListener('message', handleMessage);
    costsWorkerInstance.addEventListener('error', handleError);
    costsWorkerInstance.postMessage({ ingredientTree, globalQty });
  });
}

async function buildWorkerTree(ings) {
  const { ingredientTree } = await runDonesWorker(ings);
  const { updatedTree, totals } = await runCostsWorker(ingredientTree, 1);
  restoreCraftIngredientPrototypes(updatedTree, null);
  return { tree: updatedTree, totals };
}

function renderNodeHtml(node, level = 0) {
  const indent = level > 0 ? `padding-left:${level * 32}px;` : '';
  const priceBuy = node.buy_price ? formatGoldColored(node.buy_price) : '-';
  const priceSell = node.sell_price ? formatGoldColored(node.sell_price) : '-';
  const totalBuy = node.total_buy ? formatGoldColored(node.total_buy) : '-';
  const totalSell = node.total_sell ? formatGoldColored(node.total_sell) : '-';
  let rowHtml = `<tr>
    <td style='${indent}'>${node.icon ? `<img src='${node.icon}' style='height:28px;'>` : '-'}</td>
    <td>${node.name}</td>
    <td>${Math.round(node.count)}</td>
    <td>${priceBuy}</td>
    <td>${priceSell}</td>
    <td>${totalBuy}</td>
    <td>${totalSell}</td>
  </tr>`;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      rowHtml += renderNodeHtml(child, level + 1);
    }
  }
  return rowHtml;
}


async function renderDon(don, container) {
  const { fetchItemData, fetchPriceData } = getCore();
  if (typeof fetchItemData !== 'function') {
    errorMsg.innerText = 'Dependencia faltante: fetchItemData.';
    errorMsg.style.display = 'block';
    return;
  }
  // Si no se pasa un contenedor, se usa el global por defecto (comportamiento antiguo)
  const targetContainer = container || document.getElementById('dones-content');
  targetContainer.innerHTML = ''; // Limpiamos el contenedor específico para este don
  errorMsg.style.display = 'none';
  // No limpiar donesContent aquí, para permitir varios dones en la página (limpiaremos solo una vez afuera)
  try {
    // Si el id es ficticio (mayor a 90000) NO pedir a la API el don principal
    let donName = don.name;
    let donIcon = null;
    if (don.id < 90000) {
      // ID real: obtener datos de la API
      const donInfo = await fetchItemData(don.id);
      donName = donInfo.name;
      donIcon = donInfo.icon;
    } else {
      // ID ficticio: usar el ícono del primer ingrediente
      const primerIng = don.manualIngredients[0];
      const primerIngInfo = await fetchItemData(primerIng.id);
      donIcon = primerIngInfo.icon;
    }
    // Renderizar mainIngredients en tabla separada si existen
    let html = '';
    // Para Don de la Suerte/Magia/Poder, SOLO una tabla anidada del árbol principal, sin encabezado ni títulos
    const nombre = don.name ? don.name.toLowerCase() : '';
    const esDonSimple = nombre.includes('suerte') || nombre.includes('magia') || nombre.includes('poder');
    if (esDonSimple) {
      if (don.mainIngredients && don.mainIngredients.length > 0) {
        html += `<table class='table-modern-dones tabla-tarjetas'>
          <thead class='header-items'><tr><th>Ícono</th><th>Nombre</th><th>Cantidad</th><th>Precio Compra (u)</th><th>Precio Venta (u)</th><th>Total Compra</th><th>Total Venta</th></tr></thead><tbody>`;
        let totalBuy = 0;
        let totalSell = 0;
        for (const ing of don.mainIngredients) {
          const result = await renderIngredientRowWithComponents(ing, 0);
          html += result.html;
          totalBuy += result.totalBuy || 0;
          totalSell += result.totalSell || 0;
        }
        html += `</tbody></table>`;
        if (totalBuy > 0 || totalSell > 0) {
          html += `<div class='table-modern-totales' style='margin-bottom:50px;'>
            <div class='precio-totales-dones'>
              <div class='total-dones'><b>Total Compra estimado:</b> ${formatGoldColored(totalBuy)}</div>
              <div class='total-dones'><b>Total Venta estimado:</b> ${formatGoldColored(totalSell)}</div>
            </div>
          </div>`;
        }
      }
      targetContainer.innerHTML += html;
      return;
    }
    // Para otros dones, renderizado normal
    if (!esDonSimple) {
      html += `<h2 style='margin-top:18px;'><img src='${donIcon}' style='height:32px;vertical-align:middle;'> ${donName}</h2>`;
    }
    if (don.mainIngredients && don.mainIngredients.length > 0) {
      html += `<table class='table-modern-dones tabla-tarjetas'>
        <thead class='header-items'><tr><th>Ícono</th><th>Nombre</th><th>Cantidad</th><th>Precio Compra (u)</th><th>Precio Venta (u)</th><th>Total Compra</th><th>Total Venta</th></tr></thead><tbody>`;
      
      let totalBuy = 0;
      let totalSell = 0;
      
      for (const ing of don.mainIngredients) {
        const result = await renderIngredientRowWithComponents(ing, 0);
        html += result.html;
        totalBuy += result.totalBuy || 0;
        totalSell += result.totalSell || 0;
      }
      
      html += `</tbody></table>`;
      
      if (totalBuy > 0 || totalSell > 0) {
        html += `<div class='table-modern-totales' style='margin-bottom:50px;'>
          <div class='precio-totales-dones'>
            <div class='total-dones'><b>Total Compra estimado:</b> ${formatGoldColored(totalBuy)}</div>
            <div class='total-dones'><b>Total Venta estimado:</b> ${formatGoldColored(totalSell)}</div>
          </div>
        </div>`;
      }
    }
    // Para el Don de la Suerte, Don de la Magia y Don del Poder, NO renderizar tabla manualIngredients, solo el árbol completo
    // Ya manejado arriba para esDonSimple
    if (esDonSimple) return;
    // El renderizado de ingredientes manuales ha sido eliminado completamente.
    targetContainer.innerHTML += html;
  } catch (e) {
    errorMsg.innerText = e.message;
    errorMsg.style.display = 'block';
  }
}

// === Dones de armas legendarias Gen 1 ===
async function extractWeaponGifts() {
  const { LEGENDARY_ITEMS } = window.LegendaryData || {};
  const gifts = [];
  const seen = new Set();
  for (const item of Object.values(LEGENDARY_ITEMS)) {
    if (!item.components) continue;
    const gift = item.components.find(c => {
      if (!c.name) return false;
      const lower = c.name.toLowerCase();
      return lower.startsWith('don de') && !lower.includes('la suerte') && !lower.includes('del dominio');
    });
    if (gift && !seen.has(gift.id)) {
      seen.add(gift.id);
      gifts.push({
        id: gift.id,
        name: gift.name,
        mainIngredients: gift.components || [],
        manualIngredients: []
      });
    }
  }
  // Orden alfabético por nombre
  gifts.sort((a,b)=>a.name.localeCompare(b.name,'es'));
  return gifts;
}

// Renderizar dones de armas legendarias de 1ra Gen
async function renderLegendaryWeaponGifts() {
  const container = document.getElementById('dones-1ra-gen-content');
  const skeleton = document.getElementById('dones-1ra-gen-skeleton');
  if (!container || !skeleton) return;

  showSkeleton(skeleton);
  container.innerHTML = '';

  try {
    const gifts = await extractWeaponGifts();
    const btnsDiv = document.createElement('div');
    btnsDiv.className = 'don1gen-nav-btns';
    btnsDiv.style = 'margin-bottom: 10%; display: flex; flex-wrap: wrap; gap: 10px;';

    const resultDiv = document.createElement('div');
    resultDiv.id = 'don1gen-result';

    gifts.forEach((don) => {
      const btn = document.createElement('button');
      btn.className = 'dones-btn';
      btn.textContent = don.name;
      btn.addEventListener('click', async () => {
        btnsDiv.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        resultDiv.innerHTML = '';
        showSkeleton(skeleton);
        await renderDon(don, resultDiv);
        hideSkeleton(skeleton);
      });
      btnsDiv.appendChild(btn);
    });

    container.appendChild(btnsDiv);
    container.appendChild(resultDiv);
  } catch (error) {
    console.error('Error al renderizar dones de 1ra Gen:', error);
    container.innerHTML = '<div class="error-message">Error al cargar los dones.</div>';
  } finally {
    hideSkeleton(skeleton);
  }
}


// Renderizar dones especiales (los que no son de armas)
async function renderSpecialDons() {
  const container = document.getElementById('dones-content');
  const skeleton = donesSkeleton;
  showSkeleton(skeleton);
  container.innerHTML = '';

  // Renderizamos únicamente el Don de la Suerte (evitamos Magia y Poder para no duplicar tablas)
  const specialDons = DONES.filter(d => d.name && d.name.toLowerCase().includes('suerte')); 

  for (const don of specialDons) {
    const donContainer = document.createElement('div');
    container.appendChild(donContainer);
    await renderDon(don, donContainer);
  }
  hideSkeleton(skeleton);
}

// === Tributo Dracónico ===
async function getDraconicTribute() {
  const { LEGENDARY_ITEMS_3GEN } = window.LegendaryData || {};
  for (const weapon of Object.values(LEGENDARY_ITEMS_3GEN)) {
    const tribute = weapon.components?.find(c => {
      const nm = c.name?.toLowerCase() || '';
      return nm.includes('tributo dracónico');
    });
    if (tribute) return tribute; // Es único, lo devolvemos
  }
  throw new Error('No se encontró el Tributo Dracónico en legendaryItems3gen');
}

async function renderDraconicTribute() {
  const container = document.getElementById('tributo-draconico-content');
  const skeleton = document.getElementById('tributo-draconico-skeleton');
  if (!container || !skeleton) return;

  showSkeleton(skeleton);
  container.innerHTML = '';

  try {
    const tributoTree = await getDraconicTribute();
    let html = `<h2>${tributoTree.name}</h2>`;
    html += `<table class='table-modern-dones tabla-tarjetas'>
      <thead class='header-items'>
        <tr>
          <th>Ícono</th>
          <th>Nombre</th>
          <th>Cantidad</th>
          <th>Precio Compra (u)</th>
          <th>Precio Venta (u)</th>
          <th>Total Compra</th>
          <th>Total Venta</th>
        </tr>
      </thead>
      <tbody>`;

    let totalBuy = 0;
    let totalSell = 0;

    // Renderizar cada componente de nivel superior del tributo
    for (const component of tributoTree.components) {
      const result = await renderIngredientRowWithComponents(component, 0);
      html += result.html;
      totalBuy += result.totalBuy || 0;
      totalSell += result.totalSell || 0;
    }

    html += `</tbody></table>`;
    html += `<div class='table-modern-totales' style='margin-bottom:50px;'>
      <div class='precio-totales-dones'>
        <div class='total-dones'><b>Total Compra estimado:</b> ${formatGoldColored(totalBuy)}</div>
        <div class='total-dones'><b>Total Venta estimado:</b> ${formatGoldColored(totalSell)}</div>
      </div>
    </div>`;

    container.innerHTML = html;
  } catch (e) {
    console.error('Error al renderizar Tributo Dracónico:', e);
    container.innerHTML = '<div class="error-message">Error al cargar el Tributo Dracónico.</div>';
  } finally {
    hideSkeleton(skeleton);
  }
}

// Exponer funciones de carga perezosa para cada pestaña
const _loadedTabs = {
  special: false,
  tributo: false,
  draco: false,
  gen1: false
};

async function loadSpecialDons() {
  if (_loadedTabs.special) return;
  _loadedTabs.special = true;
  await renderSpecialDons();
}

async function loadTributo() {
  if (_loadedTabs.tributo) return;
  _loadedTabs.tributo = true;
  await renderTributo();
}

async function loadDraconicTribute() {
  if (_loadedTabs.draco) return;
  _loadedTabs.draco = true;
  await renderDraconicTribute();
}

async function loadDones1Gen() {
  if (_loadedTabs.gen1) return;
  _loadedTabs.gen1 = true;
  await renderLegendaryWeaponGifts();
}

window.DonesPages = {
  loadSpecialDons,
  loadTributo,
  loadDraconicTribute,
  loadDones1Gen
};

// === Tributo Dracónico ===
async function renderTributoDraconico() {
  const container = document.getElementById('tributo-draconico-content');
  const tributoDraconicoSkeleton = document.getElementById('tributo-draconico-skeleton');
  if (!container || !tributoDraconicoSkeleton) return;
  showSkeleton(tributoDraconicoSkeleton);
  container.innerHTML = '';
  errorMsg.style.display = 'none';
  const { fetchItemData, fetchPriceData } = getCore();
  if (typeof fetchItemData !== 'function' || typeof fetchPriceData !== 'function') {
    errorMsg.innerText = 'Dependencias faltantes: fetchItemData y/o fetchPriceData.';
    errorMsg.style.display = 'block';
    hideSkeleton(tributoDraconicoSkeleton);
    return;
  }
  try {
    if (TRIBUTO_DRACONICO.mainIngredients && TRIBUTO_DRACONICO.mainIngredients.length > 0) {
      let html = `<h3>Ingredientes principales</h3>`;
      html += `<table class='table-modern-dones tabla-tarjetas'><thead class='header-items'><tr><th>Ícono</th><th>Nombre</th><th>Cantidad</th><th>Precio Compra (u)</th><th>Precio Venta (u)</th><th>Total Compra</th><th>Total Venta</th></tr></thead><tbody>`;
      
      // Variables para acumular totales
      let totalBuy = 0;
      let totalSell = 0;
      let trebolBuy = 0;
      let trebolSell = 0;
      let piedrasBuy = 0;
      let piedrasSell = 0;
      
      // Procesar cada ingrediente principal
      for (const ing of TRIBUTO_DRACONICO.mainIngredients) {
        const result = await renderIngredientRowWithComponents(ing, 0);
        html += result.html;
        
        // Solo sumar tréboles y piedras imán dracónicas
        if (ing.id === 19675) { // Trébol místico
          trebolBuy = result.totalBuy || 0;
          trebolSell = result.totalSell || 0;
        } else if (ing.id === 92687) { // Piedra imán dracónica amalgamada (ID corregido)
          piedrasBuy = result.totalBuy || 0;
          piedrasSell = result.totalSell || 0;
        } else {
        }
      }
      
      // Sumar solo los 38 tréboles y 5 piedras imán dracónicas
      totalBuy = trebolBuy + piedrasBuy;
      totalSell = trebolSell + piedrasSell;
      
      
      html += `</tbody></table>`;
      html += `<div class="table-modern-totales" style="margin-bottom:50px;">
        <div class="precio-totales-dones">
          <div class="total-dones"><b>Total Compra estimado:</b> ${formatGoldColored(totalBuy)}</div>
          <div class="total-dones"><b>Total Venta estimado:</b> ${formatGoldColored(totalSell)}</div>
        </div>
      </div>`;
      document.getElementById('tributo-draconico-content').insertAdjacentHTML('beforeend', html);
    }
    for (const don of TRIBUTO_DRACONICO.dons) {
      const donDiv = document.createElement('div');
      donDiv.className = 'don-section';
      const donTitle = document.createElement('h3');
      donTitle.textContent = don.name;
      donDiv.appendChild(donTitle);
      for (const subdon of don.subdons) {
        const subdonDiv = document.createElement('div');
        subdonDiv.className = 'subdon-section';
        const subdonTitle = document.createElement('h4');
        subdonTitle.textContent = subdon.name;
        subdonDiv.appendChild(subdonTitle);
        // Obtener datos de ingredientes
        const ingredientes = await Promise.all(subdon.ingredients.map(async ing => {
          const [info, price] = await Promise.all([
            fetchItemData(ing.id),
            fetchPriceData(ing.id)
          ]);
          return {
            id: ing.id,
            name: info.name,
            icon: info.icon,
            count: ing.count,
            priceBuy: price ? price.buys.unit_price : null,
            priceSell: price ? price.sells.unit_price : null
          };
        }));
        // Renderizar tabla con lógica tradicional
        let totalBuy = 0;
        let totalSell = 0;
        let rowsHtml = '';
        ingredientes.forEach((ing, idx) => {
          const totalBuyIng = ing.priceBuy ? ing.priceBuy * ing.count : null;
          const totalSellIng = ing.priceSell ? ing.priceSell * ing.count : null;
          if (totalBuyIng) totalBuy += totalBuyIng;
          if (totalSellIng) totalSell += totalSellIng;
          rowsHtml += `
            <tr data-id='${ing.id}' class='${idx % 2 === 0 ? 'row-bg-a' : 'row-bg-b'}'>
              <td><img src='${ing.icon}' style='height:28px;'></td>
              <td>${ing.name}</td>
              <td>${Math.round(ing.count)}</td>
              <td>${ing.priceBuy ? formatGoldColored(ing.priceBuy) : '-'}</td>
              <td>${ing.priceSell ? formatGoldColored(ing.priceSell) : '-'}</td>
              <td>${totalBuyIng ? formatGoldColored(totalBuyIng) : '-'}</td>
              <td>${totalSellIng ? formatGoldColored(totalSellIng) : '-'}</td>
            </tr>`;
        });

        const tableHtml = `<table class='table-modern-dones tabla-tarjetas'>
          <thead class='header-items'><tr><th>Ícono</th><th>Nombre</th><th>Cantidad</th><th>Precio Compra (u)</th><th>Precio Venta (u)</th><th>Total Compra</th><th>Total Venta</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>`;
        subdonDiv.insertAdjacentHTML('beforeend', tableHtml);

        const totalsHtml = `<div class='table-modern-totales' style='margin-bottom:50px;'>
          <div class='precio-totales-dones'>
            <div class='total-dones'><b>Total Compra estimado:</b> ${formatGoldColored(totalBuy)}</div>
            <div class='total-dones'><b>Total Venta estimado:</b> ${formatGoldColored(totalSell)}</div>
          </div>
        </div>`;
        subdonDiv.insertAdjacentHTML('beforeend', totalsHtml);
        donDiv.appendChild(subdonDiv);
      }
      container.appendChild(donDiv);
    }
  } catch (e) {
    container.innerHTML = '<div class="error-message">Error al cargar el Tributo Dracónico.</div>';
  } finally {
    hideSkeleton(tributoDraconicoSkeleton);
  }
}



// === Tributo Místico ===
const TRIBUTO = {
  name: "Tributo Místico",
  mainIngredients: [
    { id: 19675, name: "Trébol místico", type: "account_bound", count: 77, components: [
  { id: 19976, name: "Moneda mística", count: 250 },
  { id: 19721, name: "Pegote de ectoplasma", count: 250 },
  { id: 19925, name: "Esquirla de obsidiana", count: 250 },
  { id: 20796, name: "Piedra filosofal", count: 1500 }
]},
    { id: 19976, name: "Moneda mística", count: 250 }
  ],
  dons: [
    {
      name: "Don de magia condensada",
      subdons: [
        {
          name: "Don de sangre",
          ingredients: [
            { id: 24295, name: "Vial de sangre poderosa", count: 100 },
            { id: 24294, name: "Vial de sangre potente", count: 250 },
            { id: 24293, name: "Vial de sangre espesa", count: 50 },
            { id: 24292, name: "Vial de sangre", count: 50 },
          ]
        },
        {
          name: "Don de veneno",
          ingredients: [
            { id: 24283, name: "Vesícula de veneno poderoso", count: 100 },
            { id: 24282, name: "Vesícula de veneno potente", count: 250 },
            { id: 24281, name: "Vesícula de veneno llena", count: 50 },
            { id: 24280, name: "Vesícula de veneno", count: 50 },
          ]
        },
        {
          name: "Don de tótems",
          ingredients: [
            { id: 24300, name: "Tótem elaborado", count: 100 },
            { id: 24299, name: "Tótem intrincado", count: 250 },
            { id: 24298, name: "Tótem grabado", count: 50 },
            { id: 24297, name: "Tótem", count: 50 },
          ]
        },
        {
          name: "Don de polvo",
          ingredients: [
            { id: 24277, name: "Montón de polvo cristalino", count: 100 },
            { id: 24276, name: "Montón de polvo incandescente", count: 250 },
            { id: 24275, name: "Montón de polvo luminoso", count: 50 },
            { id: 24274, name: "Montón de polvo radiante", count: 50 },
          ]
        },
      ]
    },
    {
      name: "Don de poder condensado",
      subdons: [
        {
          name: "Don de garras",
          ingredients: [
            { id: 24351, name: "Garra despiadada", count: 100 },
            { id: 24350, name: "Garra grande", count: 250 },
            { id: 24349, name: "Garra afilada", count: 50 },
            { id: 24348, name: "Garra", count: 50 },
          ]
        },
        {
          name: "Don de escamas",
          ingredients: [
            { id: 24289, name: "Escama blindada", count: 100 },
            { id: 24288, name: "Escama grande", count: 250 },
            { id: 24287, name: "Escama suave", count: 50 },
            { id: 24286, name: "Escama", count: 50 },
          ]
        },
        {
          name: "Don de huesos",
          ingredients: [
            { id: 24358, name: "Hueso antiguo", count: 100 },
            { id: 24341, name: "Hueso grande", count: 250 },
            { id: 24345, name: "Hueso pesado", count: 50 },
            { id: 24344, name: "Hueso", count: 50 },
          ]
        },
        {
          name: "Don de colmillos",
          ingredients: [
            { id: 24357, name: "Colmillo feroz", count: 100 },
            { id: 24356, name: "Colmillo grande", count: 250 },
            { id: 24355, name: "Colmillo afilado", count: 50 },
            { id: 24354, name: "Colmillo", count: 50 },
          ]
        },
      ]
    }
  ]
};

// === Tributo Dracónico ===
const TRIBUTO_DRACONICO = {
  name: "Tributo dracónico",
  mainIngredients: [
    { id: 19675, name: "Trébol místico", type: "account_bound", count: 38, components: [
  { id: 19976, name: "Moneda mística", count: 38 },
  { id: 19721, name: "Pegote de ectoplasma", count: 38 },
  { id: 19925, name: "Esquirla de obsidiana", count: 38 },
  { id: 20796, name: "Piedra filosofal", count: 228 }
]},
    { id: 92687, name: "Piedra imán dracónica amalgamada", count: 5 }
  ],
  dons: [
    {
      name: "Don de magia condensada",
      subdons: [
        {
          name: "Don de sangre",
          ingredients: [
            { id: 24295, name: "Vial de sangre poderosa", count: 100 },
            { id: 24294, name: "Vial de sangre potente", count: 250 },
            { id: 24293, name: "Vial de sangre espesa", count: 50 },
            { id: 24292, name: "Vial de sangre", count: 50 }
          ]
        },
        {
          name: "Don de veneno",
          ingredients: [
            { id: 24283, name: "Vesícula de veneno poderoso", count: 100 },
            { id: 24282, name: "Vesícula de veneno potente", count: 250 },
            { id: 24281, name: "Vesícula de veneno llena", count: 50 },
            { id: 24280, name: "Vesícula de veneno", count: 50 }
          ]
        },
        {
          name: "Don de tótems",
          ingredients: [
            { id: 24300, name: "Tótem elaborado", count: 100 },
            { id: 24299, name: "Tótem intrincado", count: 250 },
            { id: 24298, name: "Tótem grabado", count: 50 },
            { id: 24297, name: "Tótem", count: 50 }
          ]
        },
        {
          name: "Don de polvo",
          ingredients: [
            { id: 24277, name: "Montón de polvo cristalino", count: 100 },
            { id: 24276, name: "Montón de polvo incandescente", count: 250 },
            { id: 24275, name: "Montón de polvo luminoso", count: 50 },
            { id: 24274, name: "Montón de polvo radiante", count: 50 }
          ]
        }
      ]
    },
    {
      name: "Don de poder condensado",
      subdons: [
        {
          name: "Don de garras",
          ingredients: [
            { id: 24351, name: "Garra despiadada", count: 50 },
            { id: 24350, name: "Garra grande", count: 250 },
            { id: 24349, name: "Garra afilada", count: 50 },
            { id: 24348, name: "Garra", count: 50 }
          ]
        },
        {
          name: "Don de escamas",
          ingredients: [
            { id: 24289, name: "Escama blindada", count: 50 },
            { id: 24288, name: "Escama grande", count: 250 },
            { id: 24287, name: "Escama suave", count: 50 },
            { id: 24286, name: "Escama", count: 50 }
          ]
        },
        {
          name: "Don de huesos",
          ingredients: [
            { id: 24358, name: "Hueso antiguo", count: 50 },
            { id: 24341, name: "Hueso grande", count: 250 },
            { id: 24345, name: "Hueso pesado", count: 50 },
            { id: 24344, name: "Hueso", count: 50 }
          ]
        },
        {
          name: "Don de colmillos",
          ingredients: [
            { id: 24357, name: "Colmillo feroz", count: 50 },
            { id: 24356, name: "Colmillo grande", count: 250 },
            { id: 24355, name: "Colmillo afilado", count: 50 },
            { id: 24354, name: "Colmillo", count: 50 }
          ]
        }
      ]
    }
  ]
};

// Renderiza una fila y sus subcomponentes recursivamente
// Devuelve un objeto con {html, totalBuy, totalSell}
async function renderIngredientRowWithComponents(ing, level = 0) {
  const { tree } = await buildWorkerTree([ing]);
  const node = tree[0];
  const html = renderNodeHtml(node, level);
  return { html, totalBuy: node.total_buy || 0, totalSell: node.total_sell || 0 };
}

// Construye un árbol de componentes completo y unificado para el Tributo Místico
function buildTributoTree() {
  const root = {
    id: 'TRIBUTO_MISTICO_ROOT',
    name: TRIBUTO.name,
    count: 1,
    components: []
  };

  // 1. Añadir ingredientes principales (Trébol Místico)
  // renderIngredientRowWithComponents se encargará de sus sub-componentes
  TRIBUTO.mainIngredients.forEach(ing => {
    root.components.push({ ...ing });
  });

  // 2. Procesar los dones principales (Magia y Poder Condensado)
  TRIBUTO.dons.forEach(don => {
        const donCount = (don.name.toLowerCase().includes('magia condensada') || don.name.toLowerCase().includes('poder condensado')) ? 2 : 1;
    const donNode = {
      id: don.name.replace(/\s+/g, '_').toUpperCase(), // ID único para el don
      name: don.name,
      count: donCount,
      components: []
    };

    // 3. Procesar los subdones (Sangre, Veneno, etc.)
    don.subdons.forEach(subdon => {
      const subdonNode = {
        id: subdon.name.replace(/\s+/g, '_').toUpperCase(), // ID único para el subdon
        name: subdon.name,
        count: 1,
        components: []
      };
      
      // 4. Añadir los ingredientes finales al subdon
      subdon.ingredients.forEach(ingredient => {
        subdonNode.components.push({ ...ingredient });
      });
      
      donNode.components.push(subdonNode);
    });
    
    root.components.push(donNode);
  });

  return root;
}


// Renderiza el Tributo Místico como un árbol único y anidado
async function renderTributo() {
  const container = document.getElementById('tributo-content');
  const skeleton = document.getElementById('tributo-skeleton');
  if (!container || !skeleton) return;

  showSkeleton(skeleton);
  container.innerHTML = ''; // Limpiar contenido previo

  try {
    const tributoTree = buildTributoTree();

    let html = `<h2>${tributoTree.name}</h2>`;
    html += `<table class='table-modern-dones tabla-tarjetas'>
      <thead class='header-items'>
        <tr>
          <th>Ícono</th>
          <th>Nombre</th>
          <th>Cantidad</th>
          <th>Precio Compra (u)</th>
          <th>Precio Venta (u)</th>
          <th>Total Compra</th>
          <th>Total Venta</th>
        </tr>
      </thead>
      <tbody>`;

    let totalBuy = 0;
    let totalSell = 0;

    // Renderizar cada componente de nivel superior del árbol de forma recursiva
    for (const component of tributoTree.components) {
      const result = await renderIngredientRowWithComponents(component, 0); // Iniciar en nivel 0
      html += result.html;
      totalBuy += result.totalBuy || 0;
      totalSell += result.totalSell || 0;
    }

    html += `</tbody></table>`;

    // Mostrar los totales generales
    html += `<div class='table-modern-totales' style='margin-bottom:18px;'>
      <div class='precio-totales-dones'>
        <div class='total-dones'><b>Total Compra estimado:</b> ${formatGoldColored(totalBuy)}</div>
        <div class='total-dones'><b>Total Venta estimado:</b> ${formatGoldColored(totalSell)}</div>
      </div>
    </div>`;

    container.innerHTML = html;

  } catch (error) {
    console.error("Error al renderizar Tributo Místico:", error);
    container.innerHTML = '<div class="error-message">Error al cargar el Tributo Místico.</div>';
  } finally {
    hideSkeleton(skeleton);
  }
}


