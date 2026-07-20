import type { IpSnapshot } from '../../types.js';
export interface IpStorage {
    save(snapshot: Omit<IpSnapshot, 'id'>): IpSnapshot;
    getHistory(deviceId: string, limit?: number): IpSnapshot[];
    getLatest(deviceId: string): IpSnapshot | null;
    clear(deviceId?: string): void;
    /** Number of unique device IDs currently stored. */
    size(): number;
}
export declare function createIpStorage(maxPerDevice?: number): IpStorage;
//# sourceMappingURL=inmemory.d.ts.map