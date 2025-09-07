const ENV = (typeof process !== 'undefined' && process.env) ? process.env : {};

export const API_BASE_URL = ENV.API_BASE_URL || 'https://api.guildwars2.com/v2';
export const LANG = ENV.LANG || 'es';
export const MARKET_CSV_URL = ENV.MARKET_CSV_URL || 'https://api.datawars2.ie/gw2/v1/items/csv';
export const GW2_API_KEY = ENV.GW2_API_KEY || '';
export const priceCacheStrategy = ENV.PRICE_CACHE_STRATEGY || 'sessionStorage';

export default {
  API_BASE_URL,
  LANG,
  MARKET_CSV_URL,
  GW2_API_KEY,
  priceCacheStrategy
};
