import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
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
export function createRedisIpStorage(redisUrl = 'redis://localhost:6379', maxPerDevice = 50, ttlSeconds = 60 * 60 * 24 * 90) {
    const redis = new Redis(redisUrl, { lazyConnect: true });
    function deviceKey(deviceId) {
        return `ip:device:${deviceId}`;
    }
    function parseSnapshot(raw) {
        const s = JSON.parse(raw);
        return { ...s, timestamp: new Date(s.timestamp) };
    }
    return {
        async init() {
            await redis.connect();
        },
        async save(partial) {
            const id = randomUUID();
            const snapshot = { ...partial, id };
            const key = deviceKey(snapshot.deviceId);
            const score = snapshot.timestamp instanceof Date
                ? snapshot.timestamp.getTime()
                : new Date(snapshot.timestamp).getTime();
            await redis.zadd(key, score, JSON.stringify(snapshot));
            await redis.expire(key, ttlSeconds);
            // Trim: keep only the newest maxPerDevice entries
            const count = await redis.zcard(key);
            if (count > maxPerDevice) {
                await redis.zremrangebyrank(key, 0, count - maxPerDevice - 1);
            }
            return snapshot;
        },
        async getHistory(deviceId, limit = 50) {
            const key = deviceKey(deviceId);
            const raws = await redis.zrevrange(key, 0, limit - 1);
            return raws.map(parseSnapshot);
        },
        async getLatest(deviceId) {
            const key = deviceKey(deviceId);
            const raws = await redis.zrevrange(key, 0, 0);
            return raws.length === 0 ? null : parseSnapshot(raws[0]);
        },
        async clear(deviceId) {
            if (deviceId !== undefined) {
                await redis.del(deviceKey(deviceId));
            }
            else {
                let cursor = '0';
                do {
                    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'ip:device:*', 'COUNT', '100');
                    cursor = nextCursor;
                    if (keys.length > 0)
                        await redis.del(...keys);
                } while (cursor !== '0');
            }
        },
        async close() {
            await redis.quit();
        },
        async size() {
            let cursor = '0';
            let count = 0;
            do {
                const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'ip:device:*', 'COUNT', '100');
                cursor = nextCursor;
                count += keys.length;
            } while (cursor !== '0');
            return count;
        },
    };
}
