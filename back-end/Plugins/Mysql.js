const fp = require('fastify-plugin');
const mysql = require('mysql2');

console.log("db_name", process.env.DB_NAME);

const mysqlPlugin = async (fastify, options) => {
  const dbConfig = {
    connectionLimit: 10,
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectTimeout: 10000,
    timezone: '+00:00'
  };

  fastify.log.info({ ...dbConfig, password: '***' }, "Connecting to MySQL...");

  const pool = mysql.createPool(dbConfig);

  pool.on('connection', (connection) => {
    connection.query('SET time_zone = "+00:00"');
  });

  const executeQuery = (sql, params) => {
    return new Promise((resolve, reject) => {
      pool.query(sql, params, (err, results, fields) => {
        if (err) {
          reject(err);
        } else {
          resolve([results, fields]);
        }
      });
    });
  };

  fastify.decorate('mysql', {
    query: executeQuery,
    pool: pool
  });
};

module.exports = fp(mysqlPlugin);
