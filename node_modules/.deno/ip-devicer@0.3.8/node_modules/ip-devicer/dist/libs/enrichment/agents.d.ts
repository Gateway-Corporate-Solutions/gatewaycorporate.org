export type AiAgentProvider = 'openai' | 'anthropic' | 'xai' | 'google' | 'microsoft' | 'meta' | 'mistral' | 'cohere' | 'perplexity' | 'groq' | 'together' | 'huggingface' | 'fireworks' | 'writer' | 'deepseek';
export type AiAgentConfidence = 'verified' | 'rdap-attributed' | 'partner-attributed' | 'candidate';
export type AiAgentRangeStatus = 'default' | 'extended' | 'candidate';
export type AiAgentTrafficType = 'crawler' | 'user-triggered' | 'agent-runtime' | 'provider-infrastructure';
export type AiAgentEvidenceType = 'published-feed' | 'rdap-sample' | 'domain-resolution';
export interface AiAgentEvidence {
    type: AiAgentEvidenceType;
    reference: string;
    sampleIp?: string;
    rdapOrg?: string;
    verifiedAt?: string;
    note?: string;
}
export interface AiAgentProviderProfile {
    provider: AiAgentProvider;
    displayName: string;
    aliases: readonly string[];
    homepage: string;
    notes: string;
}
export interface AiAgentRange {
    provider: AiAgentProvider;
    confidence: AiAgentConfidence;
    status: AiAgentRangeStatus;
    source: string;
    cidr: string;
    trafficType: AiAgentTrafficType;
    evidence: readonly AiAgentEvidence[];
    notes?: string;
}
export declare const AI_AGENT_PROVIDER_PROFILES: Record<AiAgentProvider, AiAgentProviderProfile>;
export declare const AI_AGENT_CURATION_POLICY: readonly ["verified: published provider-owned bot feed or equivalent public source", "rdap-attributed: representative provider domain resolves directly to provider-owned network space", "partner-attributed: representative provider domain resolves to a known CDN or cloud partner rather than provider-owned space", "candidate: domain ownership or RDAP match is too weak to promote above watchlist level"];
export declare const VERIFIED_AI_AGENT_RANGES: AiAgentRange[];
export declare const RDAP_ATTRIBUTED_AI_AGENT_RANGES: AiAgentRange[];
export declare const PARTNER_ATTRIBUTED_AI_AGENT_RANGES: AiAgentRange[];
export declare const CANDIDATE_AI_AGENT_RANGES: AiAgentRange[];
/**
 * Default ranges are intentionally conservative to avoid broad false positives
 * if this module is wired into runtime classification. Verified feed-backed
 * OpenAI ranges are included here; lower-confidence ranges remain in the
 * extended and candidate collections until explicitly promoted.
 */
export declare const DEFAULT_AI_AGENT_RANGES: AiAgentRange[];
export declare const ALL_AI_AGENT_RANGES: AiAgentRange[];
export declare const AI_AGENT_PROVIDER_RDAP_ALIASES: Record<AiAgentProvider, string[]>;
export declare function getAiAgentRangesByConfidence(confidence: AiAgentConfidence): AiAgentRange[];
export declare function getAiAgentRangesByProvider(provider: AiAgentProvider): AiAgentRange[];
export declare function groupAiAgentRangesByProvider(ranges?: readonly AiAgentRange[]): Record<AiAgentProvider, AiAgentRange[]>;
//# sourceMappingURL=agents.d.ts.map