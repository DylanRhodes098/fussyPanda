require('dotenv').config({ quiet: true });

module.exports = function databaseConfig() {
  const database = process.env.DB_DATABASE;
  if (!database || !process.env.DB_USERNAME) {
    throw new Error('Set DB_DATABASE and DB_USERNAME for a dedicated Fussy Panda database');
  }
  if (/whats[\s_-]*good/i.test(database)) {
    throw new Error("Fussy Panda must not use a What's Good database");
  }
  return {
    database,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    dialect: 'mysql',
    dialectOptions: process.env.DB_SOCKET ? { socketPath: process.env.DB_SOCKET } : {},
    logging: false,
  };
};
