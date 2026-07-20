import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
/**
 * Create an {@link IpStorage} backed by a SQLite database via `better-sqlite3`.
 *
 * Pass `':memory:'` (the default) for an in-process store with no disk I/O,
 * or a file-system path for persistent storage.
 *
 * @param dbPath - Path to the SQLite file, or `':memory:'`. Default: `':memory:'`
 * @param maxPerDevice - Maximum snapshots to retain per deviceId. Default: `50`
 */
export function createSqliteIpStorage(dbPath = ':memory:', maxPerDevice = 50) {
    const db = new Database(dbPath);
    db.exec(`
    CREATE TABLE IF NOT EXISTS ip_snapshots (
      id        TEXT PRIMARY KEY,
      deviceId  TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      ip        TEXT NOT NULL,
      enrichment TEXT NOT NULL
    )
  `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_ip_snapshots_device ON ip_snapshots(deviceId, timestamp DESC)');
    const stmtInsert = db.prepare('INSERT INTO ip_snapshots (id, deviceId, timestamp, ip, enrichment) VALUES (?, ?, ?, ?, ?)');
    const stmtTrim = db.prepare(`
    DELETE FROM ip_snapshots
    WHERE deviceId = ?
    AND id NOT IN (
      SELECT id FROM ip_snapshots WHERE deviceId = ? ORDER BY timestamp DESC, rowid DESC LIMIT ?
    )
  `);
    const stmtHistory = db.prepare('SELECT * FROM ip_snapshots WHERE deviceId = ? ORDER BY timestamp DESC, rowid DESC');
    const stmtHistoryLimit = db.prepare('SELECT * FROM ip_snapshots WHERE deviceId = ? ORDER BY timestamp DESC, rowid DESC LIMIT ?');
    const stmtLatest = db.prepare('SELECT * FROM ip_snapshots WHERE deviceId = ? ORDER BY timestamp DESC, rowid DESC LIMIT 1');
    const stmtDeleteDevice = db.prepare('DELETE FROM ip_snapshots WHERE deviceId = ?');
    const stmtDeviceCount = db.prepare('SELECT COUNT(DISTINCT deviceId) AS n FROM ip_snapshots');
    function rowToSnapshot(row) {
        return {
            id: row['id'],
            deviceId: row['deviceId'],
            timestamp: new Date(row['timestamp']),
            ip: row['ip'],
            enrichment: JSON.parse(row['enrichment']),
        };
    }
    return {
        save(partial) {
            const id = randomUUID();
            const snapshot = { ...partial, id };
            const ts = snapshot.timestamp instanceof Date
                ? snapshot.timestamp.toISOString()
                : String(snapshot.timestamp);
            stmtInsert.run(id, snapshot.deviceId, ts, snapshot.ip, JSON.stringify(snapshot.enrichment));
            stmtTrim.run(snapshot.deviceId, snapshot.deviceId, maxPerDevice);
            return snapshot;
        },
        getHistory(deviceId, limit) {
            const rows = limit !== undefined
                ? stmtHistoryLimit.all(deviceId, limit)
                : stmtHistory.all(deviceId);
            return rows.map(rowToSnapshot);
        },
        getLatest(deviceId) {
            const row = stmtLatest.get(deviceId);
            return row ? rowToSnapshot(row) : null;
        },
        clear(deviceId) {
            if (deviceId !== undefined) {
                stmtDeleteDevice.run(deviceId);
            }
            else {
                db.exec('DELETE FROM ip_snapshots');
            }
        },
        size() {
            const row = stmtDeviceCount.get();
            return row.n;
        },
    };
}
