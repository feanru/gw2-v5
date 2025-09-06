const { MongoClient } = require('mongodb');
const { createClient } = require('redis');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { log } = require('./logger');
const { getLastSync, setLastSync } = require('./syncStatus');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/gw2';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const API_URL = 'https://api.guildwars2.com/v2/recipes';
const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 500;

async function fetchRecipes() {
  const idsParam = process.env.RECIPE_IDS || 'all';
  const res = await fetch(`${API_URL}?ids=${idsParam}`);
  return res.json();
}

async function updateRecipes() {
  const mongo = new MongoClient(MONGO_URL);
  const redis = createClient({ url: REDIS_URL });

  await mongo.connect();
  await redis.connect();

  try {
    log('[recipes] job started');
    if (process.env.DRY_RUN) {
      log('[recipes] DRY_RUN active - skipping fetch');
      await setLastSync(mongo, 'recipes');
      return;
    }
    const lastSync = await getLastSync(mongo, 'recipes');
    if (lastSync) log(`[recipes] last sync ${lastSync.toISOString()}`);
    const recipes = await fetchRecipes();
    const collection = mongo.db().collection('recipes');
    const ops = [];
    let pipeline = redis.multi();
    let processed = 0;
    const start = Date.now();

    async function flush() {
      if (!ops.length) return;
      const flushStart = Date.now();
      await Promise.all([
        collection.bulkWrite(ops),
        pipeline.exec(),
      ]);
      const duration = Date.now() - flushStart;
      processed += ops.length;
      log(`[recipes] processed ${ops.length} operations in ${duration}ms`);
      ops.length = 0;
      pipeline = redis.multi();
    }

    for (const recipe of recipes) {
      ops.push({
        updateOne: {
          filter: { id: recipe.id },
          update: { $set: recipe },
          upsert: true,
        },
      });
      pipeline.hSet('recipes', String(recipe.id), JSON.stringify(recipe));
      if (ops.length >= BATCH_SIZE) await flush();
    }
    await flush();

    await setLastSync(mongo, 'recipes');
    const totalDuration = Date.now() - start;
    log(`[recipes] upserted ${processed} documents in ${totalDuration}ms`);
  } catch (err) {
    log(`[recipes] error: ${err.message}`);
    throw err;
  } finally {
    await mongo.close();
    await redis.disconnect();
    log('[recipes] job finished');
  }
}

module.exports = updateRecipes;

if (require.main === module) {
  updateRecipes().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
