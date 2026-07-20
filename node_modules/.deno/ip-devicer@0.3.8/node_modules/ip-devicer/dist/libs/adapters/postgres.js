import pg from 'pg';
import { randomUUID } from 'node:crypto';
/**
 * Create an {@link AsyncIpStorage} backed by a PostgreSQL database via the
 * `pg` package.
 *
 * The adapter creates the `ip_snapshots` table and its index automatically on
 * the first call to `init()`.
 *
 * @param connectionString - PostgreSQL connection string,
 *   e.g. `"postgresql://user:pass@localhost:5432/mydb"`.
 * @param maxPerDevice - Maximum snapshots to retain per deviceId. Default: `50`
 */
export function createPostgresIpStorage(connectionString, maxPerDevice = 50) {
    const pool = new pg.Pool({ connectionString });
    function rowToSnapshot(row) {
        return {
            id: row['id'],
            deviceId: (row['deviceid'] ?? row['deviceId']),
            timestamp: new Date(row['timestamp']),
            ip: row['ip'],
            enrichment: typeof row['enrichment'] === 'string'
                ? JSON.parse(row['enrichment'])
                : row['enrichment'],
        };
    }
    return {
        async init() {
            await pool.query(`
        CREATE TABLE IF NOT EXISTS ip_snapshots (
          id         TEXT PRIMARY KEY,
          deviceId   TEXT        NOT NULL,
          timestamp  TIMESTAMPTZ NOT NULL,
          ip         TEXT        NOT NULL,
          enrichment JSONB       NOT NULL
        )
      `);
            await pool.query('CREATE INDEX IF NOT EXISTS idx_ip_snapshots_device ON ip_snapshots(deviceId, timestamp DESC)');
        },
        async save(partial) {
            const id = randomUUID();
            const snapshot = { ...partial, id };
            await pool.query('INSERT INTO ip_snapshots (id, deviceId, timestamp, ip, enrichment) VALUES ($1, $2, $3, $4, $5)', [id, snapshot.deviceId, snapshot.timestamp, snapshot.ip, JSON.stringify(snapshot.enrichment)]);
            // Trim old snapshots beyond the per-device cap
            await pool.query(`DELETE FROM ip_snapshots
         WHERE deviceId = $1
         AND id NOT IN (
           SELECT id FROM ip_snapshots WHERE deviceId = $1
           ORDER BY timestamp DESC LIMIT $2
         )`, [snapshot.deviceId, maxPerDevice]);
            return snapshot;
        },
        async getHistory(deviceId, limit = 50) {
            const res = await pool.query('SELECT * FROM ip_snapshots WHERE deviceId = $1 ORDER BY timestamp DESC LIMIT $2', [deviceId, limit]);
            return res.rows.map(rowToSnapshot);
        },
        async getLatest(deviceId) {
            const res = await pool.query('SELECT * FROM ip_snapshots WHERE deviceId = $1 ORDER BY timestamp DESC LIMIT 1', [deviceId]);
            return res.rows[0] ? rowToSnapshot(res.rows[0]) : null;
        },
        async clear(deviceId) {
            if (deviceId !== undefined) {
                await pool.query('DELETE FROM ip_snapshots WHERE deviceId = $1', [deviceId]);
            }
            else {
                await pool.query('DELETE FROM ip_snapshots');
            }
        },
        async close() {
            await pool.end();
        },
        async size() {
            const res = await pool.query('SELECT COUNT(DISTINCT "deviceId") AS n FROM ip_snapshots');
            return Number(res.rows[0].n);
        },
    };
}
