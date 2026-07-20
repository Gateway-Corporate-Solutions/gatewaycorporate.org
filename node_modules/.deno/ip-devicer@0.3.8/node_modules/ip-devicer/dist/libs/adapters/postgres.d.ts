import type { IpSnapshot } from '../../types.js';
/**
 * Async version of the storage interface for adapters backed by network-based
 * databases (PostgreSQL, Redis).
 */
export interface AsyncIpStorage {
    /** Initialise the store (create tables / indices if needed). */
    init(): Promise<void>;
    /** Persist a snapshot and return the full record with its generated id. */
    save(snapshot: Omit<IpSnapshot, 'id'>): Promise<IpSnapshot>;
    /** Return snapshots for a device, newest first. */
    getHistory(deviceId: string, limit?: number): Promise<IpSnapshot[]>;
    /** Return the most-recent snapshot for a device, or `null`. */
    getLatest(deviceId: string): Promise<IpSnapshot | null>;
    /** Delete snapshots — all devices if `deviceId` is omitted. */
    clear(deviceId?: string): Promise<void>;
    /** Release connection pool / client. */
    close(): Promise<void>;
    /** Number of unique device IDs currently stored. */
    size(): Promise<number>;
}
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
export declare function createPostgresIpStorage(connectionString: string, maxPerDevice?: number): AsyncIpStorage;
//# sourceMappingURL=postgres.d.ts.map