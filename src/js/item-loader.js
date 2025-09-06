import fetchWithRetry from './utils/fetchWithRetry.js';
import { startPriceUpdater } from './utils/priceUpdater.js';

let prepareIngredientTreeData,
  CraftIngredient,
  setIngredientObjs,
  findIngredientsById,
  cancelItemRequests,
  recalcAll,
  getItemBundles,
  updateState,
  preloadPrices;

let depsPromise;
async function ensureDeps() {
  if (!depsPromise) {
    depsPromise = Promise.all([
      import('./items-core.js'),
      import('./utils/priceHelper.js'),
      import('./services/recipeService.js').catch(() =>
        import('./services/recipeService.min.js')
      ),
      import('./utils/stateManager.js')
    ]).then(([core, price, recipe, state]) => {
      ({
        prepareIngredientTreeData,
        CraftIngredient,
        setIngredientObjs,
        findIngredientsById,
        cancelItemRequests,
        recalcAll
      } = core);
      ({ preloadPrices } = price);
      ({ getItemBundles } = recipe);
      ({ update: updateState } = state);
    });
  }
  return depsPromise;
}

let loadToken = 0;
let stopPriceUpdater = null;
let itemDetailsController = null;

export async function loadItems(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  await ensureDeps();
  try {
    const bundles = await getItemBundles(ids);
    return bundles;
  } catch (e) {
    console.error('Error cargando ítems', e);
    return [];
  }
}

export async function loadItem(itemId) {
  await ensureDeps();
  const currentToken = ++loadToken;
  if (itemDetailsController) {
    itemDetailsController.abort();
    itemDetailsController = null;
  }
  cancelItemRequests();

  if (!itemId) {
    window.hideSkeleton?.(document.getElementById('item-skeleton'));
    window.showError?.('ID de ítem no válido');
    return;
  }

  let rootIngredient = null;
  let marketData = null;
  const skeleton = document.getElementById('item-skeleton');

  try {
    window.showSkeleton?.(skeleton);
    itemDetailsController = new AbortController();
    const response = await fetchWithRetry(`/backend/api/itemDetails.php?itemId=${itemId}`, {
      signal: itemDetailsController.signal
    });
    if (response.status === 404) {
      window.showError?.('El ítem no existe');
      window.hideSkeleton?.(skeleton);
      return;
    }
    if (!response.ok) throw new Error(`Error ${response.status} obteniendo detalles del ítem`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(`Respuesta no válida: ${contentType}`);
    }
    const { item, recipe, market, nested_recipe } = await response.json();
    if (!item) {
      window.showError?.('El ítem no existe');
      window.hideSkeleton?.(skeleton);
      return;
    }
    if (currentToken !== loadToken) return;

    // El skeleton se ocultará tras renderizar la UI
    marketData = market || {};
    window._mainBuyPrice = marketData.buy_price || 0;
    window._mainSellPrice = marketData.sell_price || 0;

    if (!recipe) {
      setIngredientObjs([]);
      window.initItemUI(item, marketData);
      return;
    }

    if (nested_recipe) {
      recipe.nested_recipe = nested_recipe;
    }
    window._mainRecipeOutputCount = recipe.output_item_count || 1;

    setTimeout(async () => {
      if (currentToken !== loadToken) return;
      let children;
      try {
        children = await prepareIngredientTreeData(itemId, recipe);
      } catch (err) {
        console.error('Error preparando ingredientes', err);
        window.showError?.('Error al preparar los ingredientes');
        setIngredientObjs([]);
        window.initItemUI(item, marketData);
        return;
      }
      if (!Array.isArray(children)) children = [];
      rootIngredient = new CraftIngredient({
        id: item.id,
        name: item.name,
        icon: item.icon,
        rarity: item.rarity,
        count: 1,
        buy_price: marketData?.buy_price || 0,
        sell_price: marketData?.sell_price || 0,
        is_craftable: true,
        recipe,
        children
      });
      rootIngredient.recalc(window.globalQty || 1, null);
      setIngredientObjs([rootIngredient]);
      await window.initItemUI(item, marketData);
      await window.safeRenderTable?.();

      function collectIds(node, acc) {
        acc.add(node.id);
        if (node.children) node.children.forEach(child => collectIds(child, acc));
      }
      const allIds = new Set();
      collectIds(rootIngredient, allIds);

        if (stopPriceUpdater) stopPriceUpdater();
        const idsArray = Array.from(allIds);
        const applyPrices = async (priceMap) => {
          if (!document.getElementById('seccion-crafting')) {
            requestAnimationFrame(() => applyPrices(priceMap));
            return;
          }
          const updatedNodes = [];
          priceMap.forEach((data, id) => {
            const ings = findIngredientsById(window.ingredientObjs, Number(id));
            if (!ings.length) return;
            ings.forEach(ing => {
              ing.buy_price = data.buy_price || 0;
              ing.sell_price = data.sell_price || 0;
              if (ing === window.ingredientObjs[0]) {
                window._mainBuyPrice = ing.buy_price;
                window._mainSellPrice = ing.sell_price;
              }
              updatedNodes.push(ing);
            });
          });
          await window.safeRenderTable?.();
          const totals = window.getTotals?.();
          if (totals) {
            updateState('totales-crafting-global', totals);
            updateState('totales-crafting-unit', totals);
          }
          updatedNodes.forEach(ing => updateState(ing._uid, ing));
        };
        stopPriceUpdater = startPriceUpdater(idsArray, applyPrices);
      }, 0);
    } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('Error cargando ítem', err);
    window.showError?.('Error al cargar los datos del ítem');
    window.hideSkeleton?.(skeleton);
  } finally {
    itemDetailsController = null;
  }
}

// Cargar datos y preparar la UI al iniciar la página
document.addEventListener('DOMContentLoaded', () => {
  const start = () => {
    const params = new URLSearchParams(window.location.search);
    const itemId = parseInt(params.get('id'), 10);
    if (itemId) {
      loadItem(itemId);
    } else {
      window.showError?.('ID de ítem no válido');
    }
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(start);
  } else {
    setTimeout(start, 0);
  }
});
