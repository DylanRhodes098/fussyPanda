const databaseConfig = require('./database.cjs');
module.exports = {
  development: databaseConfig(),
  test: databaseConfig(),
  production: databaseConfig(),
};
