import { readFileSync } from 'node:fs';
import { DEFAULT_AI_AGENT_RANGES, } from './agents.js';
/** Default Tor exit node bulk list URL */
const DEFAULT_TOR_URL = 'https://check.torproject.org/torbulkexitlist';
/**
 * Well-known VPN provider egress CIDR prefixes (representative subset).
 * Sources: RDAP/RIPE/ARIN registry data & provider transparency pages.
 * All ranges verified via RDAP — registrant noted where it differs from provider.
 */
const DEFAULT_VPN_CIDRS = [
    // Mullvad (31173 Services AB — own registered IP space)
    '193.138.218.0/24', '193.138.219.0/24',
    '185.213.154.0/24', '185.213.155.0/24',
    '185.195.232.0/22',
    '185.65.134.0/24', '185.65.135.0/24',
    '193.32.127.0/24',
    // Mullvad via Blix / M247 transit
    '91.90.44.0/24', '188.241.83.0/24',
    '146.70.124.0/22', '146.70.128.0/22', '89.45.90.0/24',
    // ProtonVPN (Proton AG — own registered IP space)
    '185.159.156.0/22',
    '185.159.157.0/24', '185.159.158.0/24', '185.159.159.0/24',
    '194.126.177.0/24',
    // Windscribe (OVH / Total Server Solutions / Vultr infrastructure)
    '199.116.118.0/24', '104.238.180.0/24', '198.8.83.0/24',
    '104.223.100.0/22',
    '192.99.0.0/18', '51.195.12.0/22',
    // Private Internet Access (PIA / The Constant Company)
    '209.222.18.0/24',
    '198.8.80.0/21',
    '185.217.68.0/22',
    // IPVanish (StackPath / Ziff Davis infrastructure)
    '205.185.192.0/22',
    '67.205.188.0/22',
    // Surfshark (M247 / Datacamp / CDN77 / Amarutu infrastructure)
    '45.87.212.0/22', '156.146.32.0/22',
    '217.138.207.0/24', '217.138.220.0/22',
    '195.181.162.0/24',
    '143.244.48.0/22',
    '31.220.0.0/17',
    // NordVPN (Tefincom / Green Floid / M247 / UpCloud / Datacamp)
    '192.145.116.0/24', '185.93.182.0/24',
    '195.123.212.0/22', '195.123.240.0/22', '195.123.244.0/22',
    '37.120.128.0/22', '37.120.131.0/24', '37.120.135.0/24',
    '89.187.160.0/21',
    '94.237.0.0/22', '94.237.4.0/22',
    '84.17.32.0/20',
    // ExpressVPN (M247 / AP transit)
    '185.236.200.0/22',
    '103.108.48.0/22', '103.108.52.0/22',
    '149.255.56.0/22',
    // HideMyAss (HMA / Privax)
    '171.22.24.0/22', '77.247.96.0/20',
    // AirVPN (NFOrce / itm8 A/S infrastructure)
    '185.203.0.0/22', '109.201.133.0/24',
    // TunnelBear
    '216.115.17.0/24',
    // VyprVPN (IT7 Networks / Goldenfrog / Scaleway)
    '81.17.16.0/20', '185.202.220.0/22',
    '184.75.212.0/22',
    '163.172.0.0/20',
];
/**
 * Well-known public / commercial proxy provider CIDR prefixes (representative subset).
 * Includes open-proxy datacenter blocks and known residential-proxy gateways.
 * All ranges verified via RDAP — registrant noted where it differs from provider.
 */
const DEFAULT_PROXY_CIDRS = [
    // Luminati / Bright Data
    '85.238.100.0/22', '185.130.104.0/22', '154.16.72.0/22',
    '193.169.255.0/24', '45.148.0.0/22', '194.165.16.0/22',
    // Smartproxy (Clouvider / Rapidseedbox / GIG.tech infrastructure)
    '193.8.56.0/21', '85.239.32.0/22',
    '45.140.13.0/24', '185.69.166.0/24', '45.130.60.0/22',
    // Oxylabs (code200 / M247 infrastructure)
    '82.102.20.0/24', '82.102.21.0/24', '82.102.22.0/24', '82.102.23.0/24',
    '185.229.116.0/22',
    '82.102.16.0/22',
    // PacketStream
    '104.144.138.0/24', '104.144.139.0/24',
    // Storm Proxies (DigitalOcean infrastructure)
    '198.199.120.0/22', '159.89.48.0/21',
    '142.93.0.0/18', '165.232.128.0/18',
    // NetNut
    '85.203.44.0/22',
    // ProxyMesh
    '67.205.128.0/20',
    // IPRoyal (EI Technical / THE Hosting infrastructure)
    '193.57.112.0/22', '45.142.212.0/22',
    // Webshare (Namecheap infrastructure)
    '66.29.128.0/18',
    // Known open-proxy hosting blocks (Vultr / Choopa)
    '45.76.0.0/16', '45.32.0.0/14', '108.61.0.0/16',
    '104.207.128.0/17', '66.42.96.0/19', '207.246.64.0/18',
    // GiglinxProxy / proxy.sh
    '46.165.240.0/21',
];
/** RDAP org-name patterns for VPN provider fallback detection */
const VPN_ORG_PATTERNS = [
    /mullvad|31173 services/i, // Mullvad VPN / 31173 Services AB (registered owner)
    /protonvpn|proton ag/i, // ProtonVPN / Proton AG (parent company)
    /nordvpn|tefincom/i, // NordVPN / Tefincom SA (registered owner)
    /cyberghost|\bkape\b/i, // CyberGhost / Kape Technologies (also owns ExpressVPN, PIA, ZenMate)
    /zenmate/i, // ZenMate (Kape Technologies)
    /expressvpn/i,
    /ipvanish/i,
    /surfshark/i,
    /windscribe/i,
    /privateinternetaccess|pia-/i, // Private Internet Access
    /vyprvpn|goldenfrog/i, // VyprVPN / Golden Frog GmbH
    /tunnelbear/i,
    /airvpn/i,
    /hidemyass|privax/i, // HideMyAss / Privax Ltd
    /torguard|vpnetworks/i, // TorGuard / VPNetworks LLC
    /gz systems|purevpn/i, // PureVPN / GZ Systems Ltd
    /ovpn integritet|ovpn\.se/i, // OVPN.com / OVPN Integritet AB
    /\bprivatus\b/i, // IVPN / Privatus Limited
    /anchorfree|\bpango\b/i, // Hotspot Shield / AnchorFree GmbH / Pango Inc
    /\beventure\b/i, // hide.me VPN / eVenture Ltd
    /privat kommunikation/i, // PrivateVPN / Privat Kommunikation Sverige AB
    /\bivacy\b/i, // Ivacy VPN
    /\bvpn\.ac\b|\bnetsec\b/i, // VPN.ac / Netsec SRL
    /strongvpn|j2 global.*vpn/i, // StrongVPN / J2 Global
];
/** RDAP org-name patterns for proxy provider fallback detection */
const PROXY_ORG_PATTERNS = [
    /brightdata|luminati/i, // Bright Data / Luminati Networks
    /smartproxy/i,
    /oxylabs|code200/i, // Oxylabs / code200 UAB
    /packetstream/i, // PacketStream (residential peer proxy)
    /\bnetnut\b/i, // NetNut.io
    /proxymesh/i,
    /iproyal/i, // IPRoyal / EI Technical
    /webshare/i,
    /packethub/i, // PacketHub S.A. (IP wholesale & relicensing, AS44477)
    /geosurf/i, // GeoSurf (acquired by Bright Data)
    /microleaves|shifter/i, // Shifter.io (formerly Microleaves)
    /\bsoax\b/i, // SOAX residential proxy
    /rayobyte|blazing.?seo/i, // Rayobyte (formerly Blazing SEO Proxies)
    /infatica/i, // Infatica residential proxy
    /\bipxo\b/i, // IPXO IP monetization & leasing marketplace
    /proxyempire/i, // ProxyEmpire
    /nodemaven/i, // NodeMaven
    /proxy.?cheap|finecom/i, // Proxy-Cheap / Finecom OÜ
    /\bfroxy\b/i, // Froxy.com
    /\basocks\b/i, // ASocks proxy network
    /stormproxies|storm proxies/i, // Storm Proxies
    /hydraproxy/i, // HydraProxy
    /\bgiglinx\b|proxy\.sh/i, // GiglinxProxy / proxy.sh
];
/** RDAP org-name patterns for hosting/cloud provider fallback detection */
const HOSTING_ORG_PATTERNS = [
    /\bamazon\b|\baws\b/i,
    /\bgoogle\b/i,
    /\bmicrosoft\b|\bmsft\b|\bazure\b/i,
    /digitalocean/i,
    /\blinode\b|\bakamai\b/i,
    /\bovh\b/i,
    /\bhetzner\b/i,
    /\bvultr\b|\bchoopa\b/i,
    /\bm247\b/i, // M247 Ltd (AS9009) — common VPN/proxy transit provider
    /\bdatacamp\b/i, // Datacamp Limited (AS60068) — datacenter proxy registrant
    /\bscaleway\b/i, // Scaleway SAS / Online SAS — used by VyprVPN et al.
    /\bleaseweb\b/i, // LeaseWeb — popular with proxy operators
    /\bupcloud\b/i, // UpCloud — used by NordVPN et al.
    /\bhostinger\b/i, // Hostinger — cheap VPS commonly used for proxies
    /\bclouvider\b/i, // Clouvider Ltd — used by Smartproxy et al.
    /\bfrantech\b|\bbuyvm\b/i, // FranTech Solutions / BuyVM
    /\bserverius\b/i, // Serverius — Dutch, popular with proxy operators
    /\bcombahton\b/i, // Combahton GmbH — German proxy-friendly host
    /\bsharktech\b/i, // Sharktech — DDoS-protected hosting, popular with proxies
    /\bnforce\b/i, // NFOrce Entertainment (used by AirVPN et al.)
];
/** Well-known hosting/cloud ASN CIDR prefixes (representative subset) */
const HOSTING_CIDRS = [
    // AWS
    '3.0.0.0/8', '18.0.0.0/8', '52.0.0.0/8', '54.0.0.0/8', '34.0.0.0/8', '35.0.0.0/8',
    '3.8.0.0/14', '3.120.0.0/14',
    '13.32.0.0/15', '13.34.0.0/16',
    '52.14.0.0/16',
    '54.72.0.0/15',
    // GCP
    '35.185.0.0/16', '35.186.0.0/16', '35.192.0.0/14', '34.64.0.0/10',
    '34.80.0.0/12', '34.96.0.0/14',
    '35.187.0.0/16', '35.188.0.0/14', '35.196.0.0/15', '35.198.0.0/16', '35.224.0.0/14',
    // Azure
    '20.0.0.0/8', '40.64.0.0/10', '13.64.0.0/11',
    '52.224.0.0/11', '23.96.0.0/13', '168.63.0.0/16',
    // DigitalOcean
    '159.65.0.0/16', '167.99.0.0/16', '138.197.0.0/16', '104.131.0.0/16',
    '134.122.0.0/16', '137.184.0.0/16', '188.166.0.0/16', '206.189.0.0/16',
    // Linode/Akamai
    '45.33.0.0/16', '45.56.0.0/16', '172.104.0.0/14',
    '45.79.0.0/16', '66.228.32.0/19', '69.164.192.0/18', '72.14.176.0/21', '96.126.96.0/19',
    // OVH
    '51.68.0.0/16', '51.75.0.0/16', '51.161.0.0/16', '135.125.0.0/16',
    '51.38.0.0/16', '51.77.0.0/16', '51.91.0.0/16',
    '54.36.0.0/16', '54.37.0.0/16',
    '145.239.0.0/16', '178.32.0.0/14', '188.165.0.0/16', '213.32.0.0/16',
    // Hetzner
    '116.202.0.0/15', '136.243.0.0/16', '144.76.0.0/15',
    '88.99.0.0/16', '95.216.0.0/15', '157.90.0.0/16', '168.119.0.0/16', '176.9.0.0/16',
];
function parseCidrs(text) {
    return text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
}
function ipToNumber(ip) {
    return ip
        .split('.')
        .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}
function isInCidr(ip, cidr) {
    // IPv6 – skip CIDR check (only IPv4 CIDRs in our lists)
    if (ip.includes(':'))
        return false;
    const [base, prefixStr] = cidr.split('/');
    if (!base || prefixStr === undefined)
        return false;
    const prefix = parseInt(prefixStr, 10);
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (ipToNumber(ip) & mask) >>> 0 === (ipToNumber(base) & mask) >>> 0;
}
function getCidrPrefixLength(cidr) {
    const prefixStr = cidr.split('/')[1];
    return prefixStr ? parseInt(prefixStr, 10) : 0;
}
const AI_AGENT_CONFIDENCE_SCORES = {
    verified: 100,
    'rdap-attributed': 85,
    'partner-attributed': 65,
    candidate: 40,
};
export class ProxyEnricher {
    torExitListUrl;
    proxyListPaths;
    hasLicense;
    enableRdap;
    torExitNodes = new Set();
    vpnCidrs = [...DEFAULT_VPN_CIDRS];
    proxyCidrs = [...DEFAULT_PROXY_CIDRS];
    aiAgentRanges = [...DEFAULT_AI_AGENT_RANGES];
    hostingCidrs = HOSTING_CIDRS;
    initDone = false;
    constructor(torExitListUrl = DEFAULT_TOR_URL, proxyListPaths = [], hasLicense = false, enableRdap = true) {
        this.torExitListUrl = torExitListUrl;
        this.proxyListPaths = proxyListPaths;
        this.hasLicense = hasLicense;
        this.enableRdap = enableRdap;
    }
    async init() {
        if (this.initDone)
            return;
        await Promise.allSettled([
            this.fetchTorExitNodes(),
            this.loadProxyFiles(),
        ]);
        this.initDone = true;
    }
    async fetchTorExitNodes() {
        try {
            const res = await fetch(this.torExitListUrl, { signal: AbortSignal.timeout(5000) });
            if (!res.ok)
                return;
            const text = await res.text();
            for (const line of text.split('\n')) {
                const ip = line.trim();
                if (ip && !ip.startsWith('#'))
                    this.torExitNodes.add(ip);
            }
        }
        catch {
            // network unavailable — continue without Tor list
        }
    }
    loadProxyFiles() {
        if (!this.hasLicense || this.proxyListPaths.length === 0)
            return;
        for (const filePath of this.proxyListPaths) {
            try {
                const text = readFileSync(filePath, 'utf8');
                const cidrs = parseCidrs(text);
                // Heuristic: file name determines list type
                if (filePath.toLowerCase().includes('vpn')) {
                    this.vpnCidrs.push(...cidrs);
                }
                else {
                    this.proxyCidrs.push(...cidrs);
                }
            }
            catch {
                // silently skip unreadable files
            }
        }
    }
    isTor(ip) {
        return this.torExitNodes.has(ip);
    }
    async isVpn(ip, rdapInfo) {
        if (this.vpnCidrs.some((cidr) => isInCidr(ip, cidr)))
            return true;
        const { asnOrg } = rdapInfo ?? await this.getRdapInfo(ip);
        return asnOrg ? VPN_ORG_PATTERNS.some((p) => p.test(asnOrg)) : false;
    }
    async isProxy(ip, rdapInfo) {
        if (this.proxyCidrs.some((cidr) => isInCidr(ip, cidr)))
            return true;
        const { asnOrg } = rdapInfo ?? await this.getRdapInfo(ip);
        return asnOrg ? PROXY_ORG_PATTERNS.some((p) => p.test(asnOrg)) : false;
    }
    async isHosting(ip, rdapInfo) {
        if (this.hostingCidrs.some((cidr) => isInCidr(ip, cidr)))
            return true;
        const { asnOrg } = rdapInfo ?? await this.getRdapInfo(ip);
        return asnOrg ? HOSTING_ORG_PATTERNS.some((p) => p.test(asnOrg)) : false;
    }
    getAiAgentMatch(ip) {
        let bestMatch = null;
        for (const entry of this.aiAgentRanges) {
            if (!isInCidr(ip, entry.cidr)) {
                continue;
            }
            if (bestMatch === null) {
                bestMatch = entry;
                continue;
            }
            const bestScore = AI_AGENT_CONFIDENCE_SCORES[bestMatch.confidence];
            const entryScore = AI_AGENT_CONFIDENCE_SCORES[entry.confidence];
            if (entryScore > bestScore) {
                bestMatch = entry;
                continue;
            }
            if (entryScore === bestScore) {
                const bestPrefix = getCidrPrefixLength(bestMatch.cidr);
                const entryPrefix = getCidrPrefixLength(entry.cidr);
                if (entryPrefix > bestPrefix) {
                    bestMatch = entry;
                }
            }
        }
        return bestMatch;
    }
    isAiAgent(ip) {
        const match = this.getAiAgentMatch(ip);
        if (!match) {
            return { isAiAgent: false };
        }
        return {
            isAiAgent: true,
            aiAgentProvider: match.provider,
            aiAgentConfidence: AI_AGENT_CONFIDENCE_SCORES[match.confidence],
        };
    }
    /**
     * Query ARIN RDAP (falling back to RIPE on 404) to look up the registered
     * network name and origin ASN for a given IPv4 address.
     *
     * Returns `{}` for IPv6 addresses and on any network/parse failure so that
     * callers can always destructure the result safely.
     */
    async getRdapInfo(ip) {
        if (!this.enableRdap)
            return {};
        // CIDR lists are IPv4-only; skip IPv6 without hitting the network
        if (ip.includes(':'))
            return {};
        try {
            const arinRes = await fetch(`https://rdap.arin.net/registry/ip/${encodeURIComponent(ip)}`, {
                signal: AbortSignal.timeout(8_000),
            });
            if (arinRes.ok) {
                const data = await arinRes.json();
                const asnOrg = data.name ?? undefined;
                const rawAsn = data.originASes?.[0];
                const asn = rawAsn ? parseInt(rawAsn.replace(/^AS/i, ''), 10) || undefined : undefined;
                return { asn, asnOrg };
            }
            // Only fall back to RIPE when ARIN says the block is outside its registry
            if (arinRes.status !== 404)
                return {};
            const ripeRes = await fetch(`https://rdap.db.ripe.net/ip/${encodeURIComponent(ip)}`, {
                signal: AbortSignal.timeout(8_000),
            });
            if (!ripeRes.ok)
                return {};
            const data = await ripeRes.json();
            return { asnOrg: data.name ?? undefined };
        }
        catch {
            return {};
        }
    }
    async classifyAll(ip) {
        const rdapInfo = await this.getRdapInfo(ip);
        const [isVpn, isProxy, isHosting] = await Promise.all([
            this.isVpn(ip, rdapInfo),
            this.isProxy(ip, rdapInfo),
            this.isHosting(ip, rdapInfo),
        ]);
        return {
            isTor: this.isTor(ip),
            isVpn,
            isProxy,
            isHosting,
            agentInfo: this.isAiAgent(ip),
            rdapInfo,
        };
    }
    async refresh() {
        this.torExitNodes.clear();
        this.vpnCidrs = [...DEFAULT_VPN_CIDRS];
        this.proxyCidrs = [...DEFAULT_PROXY_CIDRS];
        this.aiAgentRanges = [...DEFAULT_AI_AGENT_RANGES];
        this.initDone = false;
        await this.init();
    }
}
