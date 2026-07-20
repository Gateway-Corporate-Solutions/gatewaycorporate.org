import type { IpStorage } from './inmemory.js';
/**
 * Create an {@link IpStorage} backed by a SQLite database via `better-sqlite3`.
 *
 * Pass `':memory:'` (the default) for an in-process store with no disk I/O,
 * or a file-system path for persistent storage.
 *
 * @param dbPath - Path to the SQLite file, or `':memory:'`. Default: `':memory:'`
 * @param maxPerDevice - Maximum snapshots to retain per deviceId. Default: `50`
 */
export declare function createSqliteIpStorage(dbPath?: string, maxPerDevice?: number): IpStorage;
//# sourceMappingURL=sqlite.d.ts.map