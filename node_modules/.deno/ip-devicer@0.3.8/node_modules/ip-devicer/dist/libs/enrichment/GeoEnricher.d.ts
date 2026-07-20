import type { GeoData } from '../../types.js';
export declare class GeoEnricher {
    private readonly cityDbPath?;
    private readonly asnDbPath?;
    private cityReader;
    private asnReader;
    private initPromise;
    constructor(cityDbPath?: string | undefined, asnDbPath?: string | undefined);
    init(): Promise<void>;
    private ensureInit;
    enrichCity(ip: string): Promise<Partial<GeoData>>;
    enrichAsn(ip: string): Promise<{
        asn?: number;
        asnOrg?: string;
    }>;
    enrich(ip: string): Promise<GeoData>;
    close(): void;
}
//# sourceMappingURL=GeoEnricher.d.ts.map