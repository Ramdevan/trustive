/**
 * Fastify middleware (preHandler hook) to validate Global API Keys.
 * Also logs every request to the 'api_logs' table.
 */
module.exports = async function (request, reply) {
  const { mysql } = request.server;
  const apiKey = request.headers["trustive-key"] || request.headers["trustive_key"] || request.headers["ppm-key"] || request.headers["ppm_key"];

  if (!apiKey) {
    return reply.code(401).send({
      status: false,
      msg: "API key required in 'trustive-key' header"
    });
  }

  try {
    const rows = await mysql.query(
      "SELECT * FROM api_keys WHERE api_key = ? AND status = 'active'",
      [apiKey]
    );

    if (rows.length === 0) {
      return reply.code(403).send({
        status: false,
        msg: "Invalid or inactive API key"
      });
    }

    const endpoint = request.url;
    const wallet = request.params.wallet || request.query.wallet || null;
    const ip = request.ip;
    const statusCode = 200;

    await mysql.query(
      "INSERT INTO api_logs (api_key, endpoint, wallet, ip_address, status_code) VALUES (?, ?, ?, ?, ?)",
      [apiKey, endpoint, wallet, ip, statusCode]
    );

    return;

  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({
      status: false,
      msg: "Internal server error during API key validation"
    });
  }
};
