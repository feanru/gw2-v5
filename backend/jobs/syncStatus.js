async function getLastSync(client, name) {
  const record = await client.db().collection('syncStatus').findOne({ collection: name });
  return record ? record.lastSync : null;
}

async function setLastSync(client, name, date = new Date()) {
  await client.db().collection('syncStatus').updateOne(
    { collection: name },
    { $set: { lastSync: date } },
    { upsert: true }
  );
}

module.exports = { getLastSync, setLastSync };
