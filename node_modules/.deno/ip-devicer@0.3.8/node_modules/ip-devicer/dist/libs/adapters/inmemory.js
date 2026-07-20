import { randomUUID } from 'node:crypto';
export function createIpStorage(maxPerDevice = 50) {
    const store = new Map();
    function getList(deviceId) {
        if (!store.has(deviceId))
            store.set(deviceId, []);
        return store.get(deviceId);
    }
    return {
        save(partial) {
            const snapshot = { ...partial, id: randomUUID() };
            const list = getList(snapshot.deviceId);
            // newest first
            list.unshift(snapshot);
            if (list.length > maxPerDevice)
                list.splice(maxPerDevice);
            return snapshot;
        },
        getHistory(deviceId, limit) {
            const list = getList(deviceId);
            return limit !== undefined ? list.slice(0, limit) : list.slice();
        },
        getLatest(deviceId) {
            return getList(deviceId)[0] ?? null;
        },
        clear(deviceId) {
            if (deviceId !== undefined) {
                store.delete(deviceId);
            }
            else {
                store.clear();
            }
        },
        size() {
            return store.size;
        },
    };
}
