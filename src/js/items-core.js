// Common item functions used across item and compare views
// Copied from original item.js for reuse

import { getCached, setCached } from './utils/cache.min.js';
import { fetchWithCache } from './utils/requestCache.min.js';
import { getPrice, preloadPrices } from './utils/priceHelper.min.js';

if (typeof window !== 'undefined') {
  window.ingredientObjs = window.ingredientObjs || [];
  window.globalQty = window.globalQty || 1;
  window._mainBuyPrice = window._mainBuyPrice || 0;
  window._mainSellPrice = window._mainSellPrice || 0;
  window._mainRecipeOutputCount = window._mainRecipeOutputCount || 1;
}

export function setIngredientObjs(val) {
  if (Array.isArray(val)) {
    restoreCraftIngredientPrototypes(val, null);
  }
  window.ingredientObjs = val;
}

// -------------------------
// Core data structures
// -------------------------

export class CraftIngredient {
  constructor({id, name, icon, rarity, count, buy_price, sell_price, is_craftable, recipe, children = [], _parentId = null}) {
    this._uid = CraftIngredient.nextUid++;
    this.id = id;
    this.name = name;
    this.icon = icon;
    this.rarity = rarity;
    this.count = count;
    this.buy_price = buy_price;
    this.sell_price = sell_price;
    this.is_craftable = is_craftable;
    this.recipe = recipe || null;
    this.children = children;
    this.mode = 'buy';
    this.modeForParentCrafted = 'buy';
    this.expanded = false;
    this._parentId = _parentId;
    this._parent = null;
    this.countTotal = 0;
    this.crafted_price = null;
    this.total_buy = 0;
    this.total_sell = 0;
    this.total_crafted = 0;
  }

  findRoot() {
    let current = this;
    while (current._parent) current = current._parent;
    return current;
  }

  setMode(newMode) {
    if (['buy', 'sell', 'crafted'].includes(newMode)) {
      this.modeForParentCrafted = newMode;
      const root = this.findRoot();
      root.recalc(window.globalQty || 1, null);
      if (typeof window.safeRenderTable === 'function') window.safeRenderTable();
    }
  }

  recalc(globalQty = 1, parent = null) {
    const isRoot = parent == null;
    const isMysticCloverSpecial = this.id === 19675 && (this.count === 77 || this.count === 38);
    if (isRoot) {
      this.countTotal = this.count * globalQty;
    } else if (isMysticCloverSpecial) {
      this.countTotal = this.count;
    } else {
      this.countTotal = parent.countTotal * this.count;
    }

    if (this.children && this.children.length > 0) {
      if (isMysticCloverSpecial) {
        const manualCounts = this.count === 77 ? [250, 250, 250, 1500] : [38, 38, 38, 38];
        this.children.forEach((child, idx) => {
          child.countTotal = manualCounts[idx] || 0;
          child.total_buy = (child.buy_price || 0) * child.countTotal;
          child.total_sell = (child.sell_price || 0) * child.countTotal;
        });
      } else {
        this.children.forEach(child => child.recalc(globalQty, this));
      }
    }

    if (isRoot || isMysticCloverSpecial) {
      this.total_buy = this.children.reduce((s, c) => s + (c.total_buy || 0), 0);
      this.total_sell = this.children.reduce((s, c) => s + (c.total_sell || 0), 0);
    } else {
      this.total_buy = (this.buy_price || 0) * this.countTotal;
      this.total_sell = (this.sell_price || 0) * this.countTotal;
    }

    if (this.is_craftable && this.children.length > 0) {
      this.total_crafted = this.children.reduce((sum, ing) => {
        switch (ing.modeForParentCrafted) {
          case 'buy': return sum + (ing.total_buy || 0);
          case 'sell': return sum + (ing.total_sell || 0);
          case 'crafted': return sum + (ing.total_crafted || 0);
          default: return sum + (ing.total_buy || 0);
        }
      }, 0);
      this.crafted_price = this.total_crafted / (this.recipe?.output_item_count || 1);
      // Nota: total_crafted se deriva exclusivamente del modo
      // (modeForParentCrafted) de cada hijo y no debe ser
      // sobrescrito fuera de este método.

      if (!isRoot && (!this.buy_price && !this.sell_price)) {
        this.total_buy = this.children.reduce((s, c) => s + (c.total_buy || 0), 0);
        this.total_sell = this.children.reduce((s, c) => s + (c.total_sell || 0), 0);
      }
    } else {
      this.total_crafted = null;
      this.crafted_price = null;
    }
  }

  getBestPrice() {
    if (typeof this.buy_price === 'number' && this.buy_price > 0) return this.buy_price;
    if (typeof this.crafted_price === 'number' && this.crafted_price > 0) return this.crafted_price;
    return 0;
  }
}

CraftIngredient.nextUid = 0;

export function restoreCraftIngredientPrototypes(nodes, parent = null) {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    Object.setPrototypeOf(node, CraftIngredient.prototype);
    if (typeof node._uid === 'number' && CraftIngredient.nextUid <= node._uid) {
      CraftIngredient.nextUid = node._uid + 1;
    }
    node._parent = parent;
    if (parent) node._parentId = parent._uid;
    if (Array.isArray(node.children) && node.children.length > 0) {
      restoreCraftIngredientPrototypes(node.children, node);
    } else {
      node.children = [];
    }
  }
}

export function setGlobalQty(val) {
  window.globalQty = val;
}

export function snapshotExpandState(ings) {
  if (!ings) return [];
  return ings.map(ing => ({
    id: ing.id,
    expanded: ing.expanded,
    children: snapshotExpandState(ing.children || [])
  }));
}

export function restoreExpandState(ings, snapshot) {
  if (!ings || !snapshot) return;
  for (let i = 0; i < ings.length; i++) {
    if (snapshot[i]) {
      ings[i].expanded = snapshot[i].expanded;
      restoreExpandState(ings[i].children, snapshot[i].children);
    }
  }
}

let costsWorker = null;
let lastTotals = { totalBuy: 0, totalSell: 0, totalCrafted: 0 };

export function recalcAll(ingredientObjs, globalQty) {
  if (!ingredientObjs) return Promise.resolve();
  if (!costsWorker) {
    costsWorker = new Worker(`/dist/${window.__APP_VERSION__}/workers/costsWorker.js?v=${window.__APP_VERSION__}`, { type: 'module' });
  }
  return new Promise((resolve, reject) => {
    const handleMessage = (e) => {
      costsWorker.removeEventListener('message', handleMessage);
      costsWorker.removeEventListener('error', handleError);
      const { updatedTree, totals } = e.data || {};
      if (Array.isArray(updatedTree)) {
        restoreCraftIngredientPrototypes(updatedTree, null);
      }
      function apply(src, dest) {
        Object.assign(dest, src);
        if (src.children && dest.children) {
          for (let i = 0; i < src.children.length; i++) {
            apply(src.children[i], dest.children[i]);
          }
        }
      }
      if (Array.isArray(updatedTree)) {
        for (let i = 0; i < updatedTree.length; i++) {
          apply(updatedTree[i], ingredientObjs[i]);
        }
      }
      lastTotals = totals || { totalBuy: 0, totalSell: 0, totalCrafted: 0 };
      resolve();
    };
    const handleError = (err) => {
      costsWorker.removeEventListener('message', handleMessage);
      costsWorker.removeEventListener('error', handleError);
      reject(err);
    };
    costsWorker.addEventListener('message', handleMessage);
    costsWorker.addEventListener('error', handleError);
    costsWorker.postMessage({ ingredientTree: ingredientObjs, globalQty });
  });
}

// Devuelve los últimos totales globales calculados por recalcAll.
// Siempre ejecutar recalcAll antes de llamar para obtener datos actualizados.
// Siempre retorna los totales globales y no acepta parámetros.
export function getTotals() {
  return lastTotals;
}

export function findIngredientByIdAndParent(ings, id, parentId) {
  for (const ing of ings) {
    if (String(ing.id) === String(id) && String(ing._parentId) === String(parentId)) {
      return ing;
    }
    if (Array.isArray(ing.children) && ing.children.length) {
      const found = findIngredientByIdAndParent(ing.children, id, parentId);
      if (found) return found;
    }
  }
  return null;
}

export function findIngredientByPath(ings, pathArr) {
  let current = ings;
  let ing = null;
  for (let i = 0; i < pathArr.length; i++) {
    const val = pathArr[i];
    ing = (current || []).find(n => String(n._uid) === String(val) || String(n.id) === String(val));
    if (!ing) return null;
    current = ing.children;
  }
  return ing;
}

export function findIngredientByUid(ings, uid) {
  for (const ing of ings) {
    if (String(ing._uid) === String(uid)) return ing;
    if (ing.children && ing.children.length) {
      const found = findIngredientByUid(ing.children, uid);
      if (found) return found;
    }
  }
  return null;
}

export function findIngredientById(ings, id) {
  for (const ing of ings) {
    if (String(ing.id) === String(id)) return ing;
    if (ing.children && ing.children.length) {
      const found = findIngredientById(ing.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function findIngredientsById(ings, id, acc = []) {
  if (!Array.isArray(ings)) return acc;
  for (const ing of ings) {
    if (String(ing.id) === String(id)) acc.push(ing);
    if (ing.children && ing.children.length) {
      findIngredientsById(ing.children, id, acc);
    }
  }
  return acc;
}

// -------------------------
// API helpers
// -------------------------

const activeControllers = new Set();

function trackController(controller) {
  activeControllers.add(controller);
  return controller;
}

export function cancelItemRequests() {
  activeControllers.forEach(c => c.abort());
  activeControllers.clear();
  if (ingredientTreeWorker) {
    ingredientTreeWorker.terminate();
    ingredientTreeWorker = null;
  }
}

export async function fetchItemData(id) {
  const controller = trackController(new AbortController());
  const cacheKey = `item_${id}`;
  const cached = getCached(cacheKey, true);
  const requestHeaders = {};
  if (cached?.etag) requestHeaders['If-None-Match'] = cached.etag;
  if (cached?.lastModified) requestHeaders['If-Modified-Since'] = cached.lastModified;

  try {
    // Intentar primero obtener los datos desde el backend para detectar nested_recipe
    try {
      const backendRes = await fetchWithCache(`/backend/api/itemBundle.php?ids=${id}`, {
        headers: requestHeaders,
        signal: controller.signal
      });
      if (backendRes.ok) {
        const arr = await backendRes.json();
        const entry = Array.isArray(arr) ? arr[0] : null;
        if (entry && entry.item) {
          const data = entry.item;
          if (entry.nested_recipe) data.nested_recipe = entry.nested_recipe;
          const etag = backendRes.headers.get('ETag');
          const lastModified = backendRes.headers.get('Last-Modified');
          const ttl = etag || lastModified ? null : undefined;
          data.lastUpdated = new Date().toISOString();
          setCached(cacheKey, data, ttl, { etag, lastModified });
          return data;
        }
      }
    } catch (e) {
      // Ignorar y usar el fallback
    }

    const r = await fetchWithCache(`https://api.guildwars2.com/v2/items/${id}?lang=es`, {
      headers: requestHeaders,
      signal: controller.signal
    });
    if (r.status === 304 && cached) return cached.value;
    if (!r.ok) throw new Error(`Error ${r.status} obteniendo datos del ítem ${id}`);

    const data = await r.json();
    data.lastUpdated = new Date().toISOString();
    const etag = r.headers.get('ETag');
    const lastModified = r.headers.get('Last-Modified');
    const ttl = etag || lastModified ? null : undefined;
    setCached(cacheKey, data, ttl, { etag, lastModified });
    return data;
  } finally {
    activeControllers.delete(controller);
  }
}

let ingredientTreeWorker = null;

export async function prepareIngredientTreeData(mainItemId, mainRecipeData) {
  if (!mainRecipeData || !mainRecipeData.ingredients || mainRecipeData.ingredients.length === 0) {
    window.ingredientObjs = [];
    window._mainRecipeOutputCount = mainRecipeData ? (mainRecipeData.output_item_count || 1) : 1;
    return [];
  }

  // Si el backend provee un árbol anidado, usarlo directamente
  if (mainRecipeData.nested_recipe) {
    window._mainRecipeOutputCount = mainRecipeData.output_item_count || 1;
    const deserialized = (mainRecipeData.nested_recipe || []).map(obj =>
      createCraftIngredientFromRecipe(obj, null)
    );
    restoreCraftIngredientPrototypes(deserialized, null);
    deserialized.forEach(root => root.recalc(window.globalQty, null));
    return deserialized;
  }

  // Fallback al worker si el backend no envía nested_recipe
  if (ingredientTreeWorker) {
    ingredientTreeWorker.terminate();
  }
  ingredientTreeWorker = new Worker(new URL('./workers/ingredientTreeWorker.js', import.meta.url), { type: 'module' });

  return new Promise((resolve, reject) => {
    const handleMessage = (event) => {
      ingredientTreeWorker.removeEventListener('message', handleMessage);
      ingredientTreeWorker.removeEventListener('error', handleError);
      const { tree, error } = event.data || {};
      ingredientTreeWorker = null;
      if (error) {
        const err = new Error(error);
        console.error('Error en ingredientTreeWorker:', err.message, err);
        const msg = `Error procesando ingredientes: ${err.message}`;
        if (window.StorageUtils && typeof window.StorageUtils.showToast === 'function') {
          window.StorageUtils.showToast(msg, 'error');
        } else if (typeof alert === 'function') {
          alert(msg);
        }
        reject(err);
        return;
      }
      let serialized = tree || [];
      if (!Array.isArray(serialized)) {
        if (serialized && typeof serialized === 'object') {
          serialized = Array.isArray(serialized.children) ? serialized.children : [serialized];
        } else {
          serialized = [];
        }
      }
      const deserialized = serialized.map(obj => createCraftIngredientFromRecipe(obj, null));
      restoreCraftIngredientPrototypes(deserialized, null);
      deserialized.forEach(root => root.recalc(window.globalQty, null));
      resolve(deserialized);
    };
    const handleError = (err) => {
      ingredientTreeWorker.removeEventListener('message', handleMessage);
      ingredientTreeWorker.removeEventListener('error', handleError);
      ingredientTreeWorker = null;
      console.error('Error en ingredientTreeWorker:', err?.message || err, err);
      const msg = `Error procesando ingredientes${err?.message ? `: ${err.message}` : ''}`;
      if (window.StorageUtils && typeof window.StorageUtils.showToast === 'function') {
        window.StorageUtils.showToast(msg, 'error');
      } else if (typeof alert === 'function') {
        alert(msg);
      }
      reject(err);
    };
    ingredientTreeWorker.addEventListener('message', handleMessage);
    ingredientTreeWorker.addEventListener('error', handleError);
    ingredientTreeWorker.postMessage({ mainItemId, mainRecipeData });
  });
}

export async function fetchRecipeData(outputItemId) {
  const controller = trackController(new AbortController());
  const cacheKey = `recipe_${outputItemId}`;
  const cached = getCached(cacheKey);
  if (cached) {
    activeControllers.delete(controller);
    return cached;
  }
  try {
    const recipeSearch = await fetchWithCache(`https://api.guildwars2.com/v2/recipes/search?output=${outputItemId}`, {
      signal: controller.signal
    });
    if (!recipeSearch.ok) return null;
    const ids = await recipeSearch.json();
    if (!ids || ids.length === 0) return null;
    const recipeId = ids[0];
    const recipeRes = await fetchWithCache(`https://api.guildwars2.com/v2/recipes/${recipeId}?lang=es`, {
      signal: controller.signal
    });
    if (!recipeRes.ok) throw new Error(`Error ${recipeRes.status} obteniendo datos de la receta ${recipeId}`);
    const recipe = await recipeRes.json();
    recipe.lastUpdated = new Date().toISOString();
    setCached(cacheKey, recipe);
    return recipe;
  } finally {
    activeControllers.delete(controller);
  }
}

export function createCraftIngredientFromRecipe(recipe, parentUid = null) {
  const ingredient = new CraftIngredient({
    id: recipe.id,
    name: recipe.name,
    icon: recipe.icon,
    rarity: recipe.rarity,
    count: recipe.count || 1,
    recipe: recipe.recipe || null,
    buy_price: recipe.buy_price || 0,
    sell_price: recipe.sell_price || 0,
    is_craftable: recipe.is_craftable || false,
    children: [],
    _parentId: parentUid
  });
  if (recipe.children && recipe.children.length > 0) {
    ingredient.children = recipe.children.map(child =>
      createCraftIngredientFromRecipe(
        structuredClone ? structuredClone(child) : JSON.parse(JSON.stringify(child)),
        ingredient._uid
      )
    );
  }
  return ingredient;
}

// -------------------------
// Comparativa helpers
// -------------------------

if (typeof window !== 'undefined') {
  if (typeof window.comparativa === 'undefined') {
    window.comparativa = {};
  }

    let comparativaUpdater = null;
    async function comparativaTick(ids) {
      const priceMap = await preloadPrices(ids);
      ids.forEach(id => {
        const data = priceMap.get(id) || {};
        const ing = findIngredientById(window.ingredientObjs, id);
        if (!ing) return;
        ing.buy_price = data.buy_price || 0;
        ing.sell_price = data.sell_price || 0;
        if (typeof ing.recalc === 'function') {
          ing.recalc(window.globalQty || 1, null);
        }
      });
      if (typeof window.safeRenderTable === 'function') {
        window.safeRenderTable();
      }
    }

    function refreshComparativaUpdater() {
      const ids = window.ingredientObjs ? window.ingredientObjs.map(obj => obj.id) : [];
      if (comparativaUpdater) {
        clearInterval(comparativaUpdater);
        comparativaUpdater = null;
      }
      if (ids.length === 0) return;
      const run = () => comparativaTick(ids);
      run();
      comparativaUpdater = setInterval(run, 60000);
    }

  window.comparativa.agregarItemPorId = async function(id) {
    window.ingredientObjs = window.ingredientObjs || [];
    window.globalQty = window.globalQty || 1;
    if (window.ingredientObjs.some(obj => obj.id == id)) return;
    const skeleton = document.getElementById('item-skeleton');
    try {
      if (typeof window.showSkeleton === 'function') window.showSkeleton(skeleton);
      const itemData = await fetchItemData(id);
      const recipeData = await fetchRecipeData(id);
      let marketData;
      let ingredientesArbol;
      if (recipeData) {
        let hijos = await prepareIngredientTreeData(id, recipeData);
        if (!Array.isArray(hijos)) hijos = [];
        marketData = await getPrice(id);
        window._mainBuyPrice = marketData.buy_price || 0;
        window._mainSellPrice = marketData.sell_price || 0;
        window._mainRecipeOutputCount = recipeData ? (recipeData.output_item_count || 1) : 1;
        ingredientesArbol = new CraftIngredient({
          id: itemData.id,
          name: itemData.name,
          icon: itemData.icon,
          rarity: itemData.rarity,
          count: 1,
          buy_price: marketData.buy_price,
          sell_price: marketData.sell_price,
          is_craftable: true,
          recipe: recipeData,
          children: hijos,
        });
        ingredientesArbol.recalc(window.globalQty || 1, null);
      } else {
        marketData = await getPrice(id);
        window._mainBuyPrice = marketData.buy_price || 0;
        window._mainSellPrice = marketData.sell_price || 0;
        window._mainRecipeOutputCount = 1;
        ingredientesArbol = new CraftIngredient({
          id: itemData.id,
          name: itemData.name,
          icon: itemData.icon,
          rarity: itemData.rarity,
          count: 1,
          buy_price: marketData.buy_price,
          sell_price: marketData.sell_price,
          is_craftable: false,
          recipe: null,
          children: [],
        });
      }
      window.ingredientObjs.push(ingredientesArbol);
      refreshComparativaUpdater();
      if (typeof window.safeRenderTable === 'function') {
        if (typeof marketData.buy_price === 'number' && typeof marketData.sell_price === 'number') {
          window.safeRenderTable(marketData.buy_price, marketData.sell_price);
        } else {
          window.safeRenderTable();
        }
      }
      if (typeof window.hideSkeleton === 'function') window.hideSkeleton(skeleton);
    } catch (e) {
      if (typeof window.hideSkeleton === 'function') window.hideSkeleton(skeleton);
      const msg = 'Error al agregar el ítem: ' + (e?.message || e);
      if (window.StorageUtils && typeof window.StorageUtils.showToast === 'function') {
        window.StorageUtils.showToast(msg, 'error');
      } else if (typeof alert === 'function') {
        alert(msg);
      }
      console.error('Error al agregar el ítem', e);
    }
  };

  window.comparativa.handleSaveComparativa = async function() {
    if (!window.ingredientObjs || window.ingredientObjs.length === 0) {
      window.StorageUtils?.showToast('Agrega al menos un ítem a la comparativa', 'error');
      return;
    }
    const ids = window.ingredientObjs.map(obj => obj.id);
    const nombres = window.ingredientObjs.map(obj => obj.name);
    const comparativa = { ids, nombres, timestamp: Date.now() };
    if (window.StorageUtils && typeof window.StorageUtils.saveComparativa === 'function') {
      await window.StorageUtils.saveComparativa(comparativa);
      window.StorageUtils.showToast('Comparativa guardada');
    } else {
      alert('StorageUtils no está disponible.');
    }
  };

  window.comparativa.loadComparativaFromURL = function() {
    const params = new URLSearchParams(window.location.search);
    const idsParam = params.get('ids');
    if (!idsParam) return;
    const ids = idsParam.split(',').map(id => parseInt(id,10)).filter(n => !isNaN(n));
    if (ids.length === 0) return;
    window.ingredientObjs = window.ingredientObjs || [];
    window.globalQty = window.globalQty || 1;
    const tryLoad = () => {
      if (window.comparativa && typeof window.comparativa.agregarItemPorId === 'function') {
        (async () => {
          const CHUNK_SIZE = 10;
          for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
            const chunk = ids.slice(i, i + CHUNK_SIZE);
            const results = await Promise.allSettled(
              chunk.map(id => window.comparativa.agregarItemPorId(id))
            );
            results.forEach((res, idx) => {
              if (res.status === 'rejected') {
                console.error('Error cargando ítem de la URL', chunk[idx], res.reason);
              }
            });
          }
        })();
      } else {
        setTimeout(tryLoad, 50);
      }
    };
    tryLoad();
  };
}

export function calcPercent(sold, available) {
  if (!sold || !available || isNaN(sold) || isNaN(available) || available === 0) return '-';
  return ((sold / available) * 100).toFixed(1) + '%';
}

// Assign to window for non-module scripts
if (typeof window !== 'undefined') {
  window.setIngredientObjs = setIngredientObjs;
  window.setGlobalQty = setGlobalQty;
  window.snapshotExpandState = snapshotExpandState;
  window.restoreExpandState = restoreExpandState;
  window.recalcAll = recalcAll;
  // getTotals() siempre retorna los totales globales calculados por recalcAll
  window.getTotals = getTotals;
  window.findIngredientByIdAndParent = findIngredientByIdAndParent;
  window.findIngredientByPath = findIngredientByPath;
  window.findIngredientByUid = findIngredientByUid;
  window.findIngredientById = findIngredientById;
  window.findIngredientsById = findIngredientsById;
  window.calcPercent = calcPercent;
}

