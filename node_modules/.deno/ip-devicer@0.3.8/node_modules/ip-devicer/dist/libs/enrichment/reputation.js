const WEIGHTS = {
    tor: 40,
    vpn: 30,
    proxy: 25,
    hosting: 15,
    impossibleTravel: 20,
    newCountry: 10,
    newAsn: 5,
    rdapSuspectOrg: 10,
    aiAgentVerified: 15,
    aiAgentAttributed: 10,
    aiAgentPartner: 7,
    aiAgentCandidate: 5,
};
/**
 * Known VPN registrant and commercial proxy provider org name keywords.
 * Matched case-insensitively against the `asnOrg` returned by RDAP.
 */
const RDAP_SUSPECT_ORG_KEYWORDS = [
    // VPN providers
    'mullvad', '31173 services',
    'proton ag', 'protonvpn',
    'nordvpn', 'tefincom', 'green floid',
    'expressvpn', 'express vpn',
    'surfshark', 'amarutu',
    'ipvanish', 'stackpath',
    'hidemyass', 'privax',
    'airvpn',
    'tunnelbear',
    'vyprvpn', 'goldenfrog',
    'windscribe',
    // Proxy providers
    'luminati', 'bright data',
    'smartproxy',
    'oxylabs', 'code200',
    'packetstream',
    'netnut',
    'iproyal',
    'webshare',
];
function hasSuspectOrg(asnOrg) {
    const lower = asnOrg.toLowerCase();
    return RDAP_SUSPECT_ORG_KEYWORDS.some((kw) => lower.includes(kw));
}
function getAiAgentWeight(aiAgentConfidence) {
    if (aiAgentConfidence === undefined) {
        return WEIGHTS.aiAgentCandidate;
    }
    if (aiAgentConfidence >= 90) {
        return WEIGHTS.aiAgentVerified;
    }
    if (aiAgentConfidence >= 70) {
        return WEIGHTS.aiAgentAttributed;
    }
    if (aiAgentConfidence >= 50) {
        return WEIGHTS.aiAgentPartner;
    }
    return WEIGHTS.aiAgentCandidate;
}
export function computeRiskScore(input, enabled) {
    if (!enabled)
        return { score: 0, factors: [] };
    let score = 0;
    const factors = [];
    if (input.isTor) {
        score += WEIGHTS.tor;
        factors.push('tor_exit_node');
    }
    if (input.isVpn) {
        score += WEIGHTS.vpn;
        factors.push('vpn_detected');
    }
    if (input.isProxy) {
        score += WEIGHTS.proxy;
        factors.push('proxy_detected');
    }
    if (input.isHosting) {
        score += WEIGHTS.hosting;
        factors.push('hosting_ip');
    }
    if (input.impossibleTravel) {
        score += WEIGHTS.impossibleTravel;
        factors.push('impossible_travel');
    }
    if (input.agentInfo?.isAiAgent) {
        score += getAiAgentWeight(input.agentInfo.aiAgentConfidence);
        factors.push('ai_agent_traffic');
    }
    if (input.rdapInfo?.asnOrg && hasSuspectOrg(input.rdapInfo.asnOrg)) {
        score += WEIGHTS.rdapSuspectOrg;
        factors.push('rdap_suspect_org');
    }
    if (input.deviceHistory.length > 0) {
        const lastCountry = input.deviceHistory[0]?.enrichment?.country;
        if (lastCountry && input.country && lastCountry !== input.country) {
            score += WEIGHTS.newCountry;
            factors.push('new_country');
        }
        // Use RDAP asn as fallback when MaxMind is not configured
        const effectiveAsn = input.asn ?? input.rdapInfo?.asn;
        const lastAsn = input.deviceHistory[0]?.enrichment?.asn;
        if (lastAsn !== undefined && effectiveAsn !== undefined && lastAsn !== effectiveAsn) {
            score += WEIGHTS.newAsn;
            factors.push('new_asn');
        }
    }
    return { score: Math.min(score, 100), factors };
}
