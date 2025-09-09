export {};
let CraftIngredient;
if (typeof self === 'undefined') {
  ({ CraftIngredient } = await import('../items-core.js'));
} else {
  const manifest = await fetch('/dist/manifest.json').then(r => r.json()).catch(() => ({}));
  const itemsCorePath = manifest['/dist/js/items-core.min.js'] || `../items-core.${self.__APP_VERSION__}.min.js`;
  ({ CraftIngredient } = await import(itemsCorePath));
}

const ctx = typeof self !== 'undefined' ? self : globalThis;

function rebuildTreeArray(tree) {
  if (!Array.isArray(tree)) return [];
  return tree.map(node => rebuildNode(node, null));
}

function rebuildNode(data, parent) {
  const ing = new CraftIngredient(data);
  Object.assign(ing, data);
  if (typeof data._uid === 'number') {
    ing._uid = data._uid;
    if (CraftIngredient.nextUid <= data._uid) {
      CraftIngredient.nextUid = data._uid + 1;
    }
  }
  ing._parent = parent || null;
  ing.children = Array.isArray(data.children)
    ? data.children.map(child => rebuildNode(child, ing))
    : [];
  return ing;
}

function recalcAll(ingredientObjs, globalQty) {
  if (!ingredientObjs) return;
  ingredientObjs.forEach((ing) => {
    ing.recalc(globalQty, null);
  });
}

function getTotals(ingredientObjs) {
  let totalBuy = 0, totalSell = 0, totalCrafted = 0;
  for (const ing of ingredientObjs) {
    totalBuy += ing.total_buy || 0;
    totalSell += ing.total_sell || 0;
    switch (ing.modeForParentCrafted) {
      case 'sell':
        totalCrafted += ing.total_sell || 0;
        break;
      case 'crafted':
        totalCrafted += ing.total_crafted || 0;
        break;
      default:
        totalCrafted += ing.total_buy || 0;
        break;
    }
  }
  return { totalBuy, totalSell, totalCrafted };
}

ctx.onmessage = (e) => {
  const { ingredientTree, globalQty } = e.data || {};
  const ingredientObjs = rebuildTreeArray(ingredientTree);
  recalcAll(ingredientObjs, globalQty);
  const totals = getTotals(ingredientObjs);
  ctx.postMessage({ updatedTree: ingredientObjs, totals });
};

export { rebuildTreeArray, recalcAll, getTotals };

