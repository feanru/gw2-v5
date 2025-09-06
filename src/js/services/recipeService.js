// Servicio para manejar las llamadas a la API de recetas v2

import { getCached, setCached } from '../utils/cache.js';
import { fetchWithCache } from '../utils/requestCache.js';
import fetchWithRetry from '../utils/fetchWithRetry.js';
import { getPrice, preloadPrices } from '../utils/priceHelper.js';
import config from '../config.js';

const API_BASE_URL = config.API_BASE_URL;

/**
 * Obtiene un paquete combinado de ítem, receta y mercado para múltiples IDs
 * @param {number[]} ids - Lista de IDs de ítems
 * @returns {Promise<Array>} - Datos por ítem en el mismo orden recibido
 */
export async function getItemBundles(ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) return [];

    const results = new Map();
    const toFetch = [];

    ids.forEach(id => {
        const cached = getCached(`bundle_${id}`);
        if (cached) {
            results.set(id, cached);
        } else {
            toFetch.push(id);
        }
    });

    if (toFetch.length > 0) {
        const params = toFetch.map(id => `ids[]=${id}`).join('&');
        fetchWithRetry(`/backend/api/dataBundle.php?${params}`)
            .then(response => (response.ok ? response.json() : null))
            .then(data => {
                if (!data) return;
                data.forEach(entry => {
                    setCached(`bundle_${entry.id}`, entry);
                    // Notificar al cliente para actualizar la UI con datos frescos
                    window.dispatchEvent(new CustomEvent('bundleItemRefreshed', { detail: entry }));
                });
            })
            .catch(e => console.error('Error en getItemBundles:', e));
    }

    return ids.map(id => results.get(id) || null);
}

/**
 * Obtiene las recetas para un ítem específico
 * @param {number} itemId - ID del ítem
 * @returns {Promise<Array>} - Lista de recetas
 */
export async function getRecipesForItem(itemId) {
    const ids = Array.isArray(itemId) ? itemId : [itemId];
    const bundles = await getItemBundles(ids);
    if (Array.isArray(itemId)) {
        return bundles.map(b => (b?.recipe ? [b.recipe] : []));
    }
    const recipe = bundles[0]?.recipe;
    return recipe ? [recipe] : [];
}

/**
 * Obtiene los detalles de una receta específica
 * @param {number} recipeId - ID de la receta
 * @returns {Promise<Object>} - Detalles de la receta
 */
export async function getRecipeDetails(recipeId) {
    const cacheKey = `recipe_${recipeId}`;
    const cached = getCached(cacheKey, true);

    try {
        const response = await fetchWithCache(`${API_BASE_URL}/recipes/${recipeId}`, {}, cacheKey, cached);
        if (!response.ok) {
            return null;
        }

        const recipe = await response.json();
        if (!recipe) {
            return null;
        }
        recipe.lastUpdated = new Date().toISOString();
        const etag = response.headers.get('ETag');
        const lastModified = response.headers.get('Last-Modified');
        setCached(cacheKey, recipe, undefined, { etag, lastModified });
        return recipe;
    } catch (error) {
        console.error('Error en getRecipeDetails:', error);
        return null;
    }
}

/**
 * Obtiene información detallada de un ítem
 * @param {number} itemId - ID del ítem
 * @returns {Promise<Object>} - Información del ítem
 */
export async function getItemDetails(itemId) {
    if (Array.isArray(itemId)) {
        const bundles = await getItemBundles(itemId);
        return bundles.map(b => b?.item || null);
    }
    const bundle = await getItemBundles([itemId]);
    return bundle[0]?.item || null;
}

/**
 * Obtiene los precios de un ítem usando la API CSV
 * @param {number} itemId - ID del ítem
 * @returns {Promise<Object>} - Precios de compra y venta
 */
export async function getItemPrices(itemId) {
    if (Array.isArray(itemId)) {
        const map = await preloadPrices(itemId);
        return itemId.map(id => {
            const p = map.get(id) || {};
            return { buys: { unit_price: p.buy_price || 0 }, sells: { unit_price: p.sell_price || 0 } };
        });
    }
    const p = await getPrice(itemId);
    return { buys: { unit_price: p?.buy_price || 0 }, sells: { unit_price: p?.sell_price || 0 } };
}

// Exponer funciones al ámbito global para compatibilidad
if (typeof window !== 'undefined') {
    window.getRecipesForItem = getRecipesForItem;
    window.getRecipeDetails = getRecipeDetails;
    window.getItemDetails = getItemDetails;
    window.getItemPrices = getItemPrices;
    window.getItemBundles = getItemBundles;
}
