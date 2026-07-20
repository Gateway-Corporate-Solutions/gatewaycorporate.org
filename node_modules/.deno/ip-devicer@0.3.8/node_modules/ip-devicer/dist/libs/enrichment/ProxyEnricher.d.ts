import { type AiAgentProvider } from './agents.js';
type AgentInfo = {
    isAiAgent: boolean;
    aiAgentProvider?: AiAgentProvider;
    aiAgentConfidence?: number;
};
export declare class ProxyEnricher {
    private readonly torExitListUrl;
    private readonly proxyListPaths;
    private readonly hasLicense;
    private readonly enableRdap;
    private torExitNodes;
    private vpnCidrs;
    private proxyCidrs;
    private aiAgentRanges;
    private readonly hostingCidrs;
    private initDone;
    constructor(torExitListUrl?: string, proxyListPaths?: string[], hasLicense?: boolean, enableRdap?: boolean);
    init(): Promise<void>;
    private fetchTorExitNodes;
    private loadProxyFiles;
    isTor(ip: string): boolean;
    isVpn(ip: string, rdapInfo?: {
        asn?: number;
        asnOrg?: string;
    }): Promise<boolean>;
    isProxy(ip: string, rdapInfo?: {
        asn?: number;
        asnOrg?: string;
    }): Promise<boolean>;
    isHosting(ip: string, rdapInfo?: {
        asn?: number;
        asnOrg?: string;
    }): Promise<boolean>;
    private getAiAgentMatch;
    isAiAgent(ip: string): AgentInfo;
    /**
     * Query ARIN RDAP (falling back to RIPE on 404) to look up the registered
     * network name and origin ASN for a given IPv4 address.
     *
     * Returns `{}` for IPv6 addresses and on any network/parse failure so that
     * callers can always destructure the result safely.
     */
    getRdapInfo(ip: string): Promise<{
        asn?: number;
        asnOrg?: string;
    }>;
    classifyAll(ip: string): Promise<{
        isTor: boolean;
        isVpn: boolean;
        isProxy: boolean;
        isHosting: boolean;
        agentInfo: AgentInfo;
        rdapInfo: {
            asn?: number;
            asnOrg?: string;
        };
    }>;
    refresh(): Promise<void>;
}
export {};
//# sourceMappingURL=ProxyEnricher.d.ts.map