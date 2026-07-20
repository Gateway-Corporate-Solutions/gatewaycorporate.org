import type { AsyncIpStorage } from './postgres.js';
/**
 * Create an {@link AsyncIpStorage} backed by Redis via `ioredis`.
 *
 * **Key schema**
 * - `ip:device:<deviceId>` — Sorted set (score = timestamp ms) of serialised
 *   {@link IpSnapshot} JSON values. Keys expire after `ttlSeconds` seconds.
 *
 * @param redisUrl - Redis connection URL. Default: `'redis://localhost:6379'`
 * @param maxPerDevice - Maximum snapshots to retain per deviceId. Default: `50`
 * @param ttlSeconds - TTL for device keys. Default: 90 days
 */
export declare function createRedisIpStorage(redisUrl?: string, maxPerDevice?: number, ttlSeconds?: number): AsyncIpStorage;
//# sourceMappingURL=redis.d.ts.map