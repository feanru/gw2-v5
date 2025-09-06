const { MongoClient } = require('mongodb');

const url = process.env.MONGO_URL || 'mongodb://localhost:27017/gw2';

async function ensureIndexes() {
  const client = new MongoClient(url);
  try {
    await client.connect();
    const db = client.db();

    const items = db.collection('items');
    await items.createIndex({ id: 1 });
    await items.createIndex({ lang: 1 });
    await items.createIndex({ tradable: 1 });

    const recipes = db.collection('recipes');
    await recipes.createIndex({ output_item_id: 1 });
    await recipes.createIndex({ input_item_id: 1 });

    console.log('MongoDB indices ensured');
  } finally {
    await client.close();
  }
}

ensureIndexes().catch(err => {
  console.error('Failed to create indexes', err);
  process.exit(1);
});
