import type { IpEnrichment, IpSnapshot } from '../types.js';
export declare function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number;
export declare function detectImpossibleTravel(current: {
    lat: number;
    lon: number;
    ts: Date;
}, last: {
    lat: number;
    lon: number;
    ts: Date;
}, thresholdKmh: number): boolean;
export declare function computeRiskDelta(current: IpEnrichment, history: IpSnapshot[]): number;
export declare function computeConsistencyScore(current: IpEnrichment, history: IpSnapshot[]): number;
//# sourceMappingURL=scoring.d.ts.map