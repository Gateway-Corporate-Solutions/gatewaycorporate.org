export interface IpManagerOptions {
    /**
     * Polar license key that unlocks Pro or Enterprise tier features.
     *
     * | Tier         | Price    | Device limit | Servers   |
     * |--------------|---------|--------------|-----------|
     * | Free         | $0/mo    | 10,000       | —         |
     * | Pro          | $49/mo   | Unlimited    | 1 server  |
     * | Enterprise   | $299/mo  | Unlimited    | Unlimited |
     *
     * VPN/proxy detection and extended history require Pro or Enterprise.
     * Obtain a key at https://polar.sh and configure {@link POLAR_ORGANIZATION_ID}
     * and {@link POLAR_BENEFIT_IDS} in `src/libs/license.ts`.
     */
    licenseKey?: string;
    /** Path to GeoLite2-City.mmdb or GeoIP2-City.mmdb */
    maxmindPath?: string;
    /** Path to GeoLite2-ASN.mmdb or GeoIP2-ASN.mmdb */
    asnPath?: string;
    /** Enable reputation scoring (requires licenseKey for full signals) */
    enableReputation?: boolean;
    /** URL to fetch Tor exit node list from. Default: Tor Project bulk list */
    torExitListUrl?: string;
    /** Paths to plain-text CIDR files for VPN/proxy ranges (one CIDR per line) */
    proxyListPaths?: string[];
    /**
     * Enable RDAP lookups for ASN enrichment. Default: `true`.
     * Set to `false` to skip outbound RDAP network calls entirely.
     */
    enableRdap?: boolean;
    /** Max IP snapshots kept per deviceId in memory. Default: 50 (10 without key) */
    maxHistoryPerDevice?: number;
    /** Minimum km/h speed that triggers impossible-travel alert. Default: 900 */
    impossibleTravelThresholdKmh?: number;
    /**
     * Custom storage backend. Defaults to the built-in in-memory store.
     * Use `createSqliteIpStorage`, `createPostgresIpStorage`, or
     * `createRedisIpStorage` to supply a persistent backend.
     *
     * The `IpStorage` interface is synchronous (in-memory, SQLite).
     * For async backends (Postgres, Redis) initialise them separately and
     * wrap in an adapter that satisfies `IpStorage`, or use them standalone
     * via their own `AsyncIpStorage` interface.
     */
    storage?: import('./libs/adapters/inmemory.js').IpStorage | import('./libs/adapters/postgres.js').AsyncIpStorage;
}
export interface GeoData {
    country?: string;
    countryName?: string;
    city?: string;
    subdivision?: string;
    latitude?: number;
    longitude?: number;
    timezone?: string;
    asn?: number;
    asnOrg?: string;
}
export interface IpEnrichment extends GeoData {
    isProxy: boolean;
    isVpn: boolean;
    isTor: boolean;
    isHosting: boolean;
    agentInfo?: {
        isAiAgent: boolean;
        aiAgentProvider?: string;
        aiAgentConfidence?: number;
    };
    rdapInfo: {
        asn?: number;
        asnOrg?: string;
    };
    riskScore: number;
    riskFactors: string[];
    consistencyScore: number;
    impossibleTravel: boolean;
}
export interface IpSnapshot {
    id: string;
    deviceId: string;
    timestamp: Date;
    ip: string;
    enrichment: IpEnrichment;
}
export interface IpIdentifyContext {
    ip?: string;
    userId?: string;
    headers?: Record<string, string | string[] | undefined>;
}
export interface IdentifyResult {
    deviceId: string;
    confidence: number;
    isNewDevice: boolean;
    matchConfidence: number;
    linkedUserId?: string;
    enrichmentInfo: {
        plugins: string[];
        details: Record<string, Record<string, unknown>>;
        failures: Array<{
            plugin: string;
            message: string;
        }>;
    };
}
export interface EnrichedIdentifyResult extends IdentifyResult {
    ipEnrichment?: IpEnrichment;
    ipRiskDelta?: number;
}
//# sourceMappingURL=types.d.ts.map