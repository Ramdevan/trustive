process.env.TZ = 'Asia/Kolkata';

const path = require('path');

require('dotenv').config({
  path: path.resolve(__dirname, '.env')
});

const fastify = require('fastify')({ logger: true, caseSensitive: false, bodyLimit: 50 * 1024 * 1024 });

fastify.register(require('@fastify/cors'), {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
});
fastify.register(require('@fastify/formbody'));
fastify.register(require('@fastify/jwt'), { secret: process.env.JWT_SECRET || 'TRUSTIVE_SECRET_KEY_2024' });
fastify.register(require('@fastify/multipart'), { limits: { fileSize: 10 * 1024 * 1024 } });
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public/uploads'),
  prefix: '/uploads/',
  decorateReply: false
});

fastify.register(require('./Plugins/Mysql'));

fastify.register(require('./Controllers/UserController'), { prefix: "/api/user" });
fastify.register(require('./Controllers/AdminController'), { prefix: "/api/admin" });

fastify.listen({ port: process.env.PORT || 3007, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`Trustive Server listening at ${address}`);
});
