// Self-contained worker without external dependencies.
class CraftIngredient {
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
      root.recalc(globalThis.globalQty || 1, null);
      if (typeof globalThis.safeRenderTable === 'function') globalThis.safeRenderTable();
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
          case 'sell': return sum + (ing.total_sell || 0);
          case 'crafted': return sum + (ing.total_crafted || 0);
          default: return sum + (ing.total_buy || 0);
        }
      }, 0);
      this.crafted_price = this.total_crafted / (this.recipe?.output_item_count || 1);

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

