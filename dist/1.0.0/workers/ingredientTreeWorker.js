import { fetchWithCache } from '../utils/requestCache.min.js';

self.onmessage = async (e) => {
  const { mainItemId } = e.data;
  try {
    const tree = await prepareIngredientTreeData(mainItemId);
    self.postMessage({ tree });
  } catch (err) {
    self.postMessage({ error: err.message });
  }
};

async function prepareIngredientTreeData(mainItemId) {
  const rootNested = await fetchWithCache(`/recipe-tree/${mainItemId}`).then((r) => r.json());
  if (!rootNested || !rootNested.components || rootNested.components.length === 0) {
    return [];
  }

  const allItemIds = new Set();
  (function gather(node) {
    if (!node) return;
    allItemIds.add(node.id);
    if (node.components) {
      node.components.forEach((comp) => {
        if (comp.type === 'Recipe') gather(comp);
        else if (comp.type === 'Item') allItemIds.add(comp.id);
      });
    }
  })(rootNested);

  const allItemsDetailsMap = new Map();
  const allIdsArray = Array.from(allItemIds);
  for (let i = 0; i < allIdsArray.length; i += 200) {
    const chunk = allIdsArray.slice(i, i + 200);
    const itemsChunk = await fetchWithCache(
      `https://api.guildwars2.com/v2/items?ids=${chunk.join(',')}&lang=es`,
    ).then((r) => r.json());
    itemsChunk.forEach((item) => allItemsDetailsMap.set(item.id, item));
  }

  const marketDataMap = new Map();
  try {
    const csvUrl = `https://api.datawars2.ie/gw2/v1/items/csv?fields=id,buy_price,sell_price&ids=${Array.from(
      allItemIds,
    ).join(',')}`;
    const csvText = await fetchWithCache(csvUrl).then((r) => r.text());
    const [headers, ...rows] = csvText.trim().split('\n').map((line) => line.split(','));
    if (headers && headers.length > 0) {
      for (const row of rows) {
        const obj = {};
        headers.forEach((h, idx) => {
          const value = row[idx];
          if (h === 'id') obj[h] = parseInt(value, 10);
          else if (h === 'buy_price' || h === 'sell_price')
            obj[h] = value !== '' && value !== undefined ? parseInt(value, 10) : null;
          else obj[h] = value;
        });
        if (obj.id) marketDataMap.set(obj.id, obj);
      }
    }
  } catch (e) {
    // ignore CSV fetch errors
  }

  const missingMarketIds = Array.from(allItemIds).filter((id) => !marketDataMap.has(id));
  for (let i = 0; i < missingMarketIds.length; i += 200) {
    const chunk = missingMarketIds.slice(i, i + 200);
    try {
      const chunkData = await fetchWithCache(
        `https://api.guildwars2.com/v2/commerce/prices?ids=${chunk.join(',')}`,
      ).then((r) => r.json());
      chunkData.forEach((p) => {
        marketDataMap.set(p.id, {
          id: p.id,
          buy_price: p.buys?.unit_price ?? null,
          sell_price: p.sells?.unit_price ?? null,
        });
      });
    } catch (e) {
      // ignore
    }
  }

  function convertComponent(node, parentId = null) {
    const itemDetail = allItemsDetailsMap.get(node.id);
    if (!itemDetail) return null;
    const marketInfo = marketDataMap.get(node.id) || {};
    const isCraftable = Array.isArray(node.components) && node.components.length > 0;
    let children = [];

    if (isCraftable) {
      children = node.components
        .map((comp) => {
          if (comp.type === 'Recipe') {
            return convertComponent(comp, itemDetail.id);
          } else if (comp.type === 'Item') {
            const detail = allItemsDetailsMap.get(comp.id);
            if (!detail) return null;
            const mInfo = marketDataMap.get(comp.id) || {};
              return {
                id: detail.id,
                name: detail.name,
                icon: detail.icon,
                rarity: detail.rarity,
                count: comp.quantity,
                buy_price: mInfo.buy_price ?? null,
                sell_price: mInfo.sell_price ?? null,
                crafted_price: null,
                is_craftable: false,
                recipe: null,
                children: [],
                _parentId: itemDetail.id,
              };
          } else {
            return null;
          }
        })
        .filter(Boolean);
    }

    return {
      id: itemDetail.id,
      name: itemDetail.name,
      icon: itemDetail.icon,
      rarity: itemDetail.rarity,
      count: node.quantity,
      buy_price: marketInfo.buy_price ?? null,
      sell_price: marketInfo.sell_price ?? null,
      crafted_price: null,
      is_craftable: isCraftable,
      recipe: node.recipe || null,
      children,
      _parentId: parentId,
    };
  }

  const root = convertComponent(rootNested, null);
  return root ? root.children || [] : [];
}

