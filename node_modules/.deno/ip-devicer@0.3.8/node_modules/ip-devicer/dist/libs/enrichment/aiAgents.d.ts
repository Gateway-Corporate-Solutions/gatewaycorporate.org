export type AiAgentProvider = 'openai' | 'anthropic' | 'xai';
export type AiAgentConfidence = 'verified' | 'attributed';
export interface AiAgentRange {
    provider: AiAgentProvider;
    confidence: AiAgentConfidence;
    source: string;
    cidr: string;
}
/**
 * Seed AI-agent ranges that are safe to ship by default.
 *
 * OpenAI publishes crawler IP feeds publicly. Anthropic and xAI do not publish
 * equivalent IP feeds in the sources reviewed for this implementation, so they
 * are intentionally left out of the runtime defaults until they can be curated
 * and verified via the maintenance workflow.
 */
export declare const DEFAULT_AI_AGENT_RANGES: AiAgentRange[];
export declare const AI_AGENT_PROVIDER_RDAP_ALIASES: Record<AiAgentProvider, string[]>;
//# sourceMappingURL=aiAgents.d.ts.map