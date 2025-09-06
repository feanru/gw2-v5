const API_ITEM = 'https://api.guildwars2.com/v2/items/';
const API_PRICES = 'https://api.guildwars2.com/v2/commerce/prices/';

const FIXED_PRICE_ITEMS = {
  19676: 10000
};

const EXCLUDED_ITEM_IDS = [
  19675,
  19925,
  20796,
  20799,
  19665,
  19674,
  19626,
  19672,
  19673,
  19645, 19650, 19655, 19639, 19635, 19621
];

function shouldSkipMarketCheck(id) {
  return EXCLUDED_ITEM_IDS.includes(id);
}

async function fetchItemData(id) {
  try {
    const res = await fetch(`${API_ITEM}${id}?lang=es`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchPriceData(id) {
  if (FIXED_PRICE_ITEMS[id] !== undefined) {
    const p = FIXED_PRICE_ITEMS[id];
    return { buys: { unit_price: p }, sells: { unit_price: p } };
  }
  if (shouldSkipMarketCheck(id)) return null;
  try {
    const res = await fetch(`${API_PRICES}${id}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function adaptNode(node, parentId = null) {
  const info = await fetchItemData(node.id);
  const price = await fetchPriceData(node.id);
  const children = Array.isArray(node.components)
    ? await Promise.all(node.components.map(c => adaptNode(c, node.id)))
    : [];
  return {
    id: node.id,
    name: info?.name || node.name,
    icon: info?.icon || null,
    rarity: info?.rarity || null,
    count: node.count,
    buy_price: price?.buys?.unit_price ?? null,
    sell_price: price?.sells?.unit_price ?? null,
    is_craftable: children.length > 0,
    children,
    _parentId: parentId
  };
}

const ctx = typeof self !== 'undefined' ? self : globalThis;

ctx.onmessage = async (e) => {
  const { rootIngredients = [] } = e.data || {};
  const ingredientTree = await Promise.all(rootIngredients.map(r => adaptNode(r, null)));
  ctx.postMessage({ ingredientTree });
};

export { adaptNode };
