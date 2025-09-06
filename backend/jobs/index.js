const cron = require('node-cron');
const { log } = require('./logger');
const updateItems = require('./updateItems');
const updateRecipes = require('./updateRecipes');
const buildRecipeTrees = require('./buildRecipeTrees');

log('scheduler started');

cron.schedule('0 * * * *', () => {
  log('triggering updateItems');
  updateItems().catch(err => log(`updateItems failed: ${err.message}`));
});

cron.schedule('30 * * * *', () => {
  log('triggering updateRecipes');
  updateRecipes().catch(err => log(`updateRecipes failed: ${err.message}`));
});

cron.schedule('45 * * * *', () => {
  log('triggering buildRecipeTrees');
  buildRecipeTrees().catch(err => log(`buildRecipeTrees failed: ${err.message}`));
});
