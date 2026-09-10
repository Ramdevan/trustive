/**
 * Convert a MySQL TIMESTAMP or JS Date to a UTC ISO string.
 * MySQL returns dates in server local time; this normalises them to UTC.
 */
function toUtcISOString(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Format a JS Date (or ISO string) to MySQL DATETIME format: 'YYYY-MM-DD HH:MM:SS'
 */
function formatForMySQL(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Check active token sales and mark expired ones as 'ended'.
 * @param {object} mysql - fastify-mysql instance
 */
async function updateSaleStatuses(mysql) {
  try {
    // Promote scheduled sales whose start time has arrived
    await mysql.query(
      `UPDATE token_sales SET status = 'active' WHERE status = 'scheduled' AND start_at <= UTC_TIMESTAMP() AND (end_at IS NULL OR end_at >= UTC_TIMESTAMP())`
    );
    // Mark expired sales as ended
    await mysql.query(
      `UPDATE token_sales SET status = 'ended' WHERE status = 'active' AND end_at IS NOT NULL AND end_at < UTC_TIMESTAMP()`
    );
  } catch (err) {
    // Non-fatal — log and continue
    console.error('updateSaleStatuses error:', err.message);
  }
}

module.exports = { toUtcISOString, formatForMySQL, updateSaleStatuses };
