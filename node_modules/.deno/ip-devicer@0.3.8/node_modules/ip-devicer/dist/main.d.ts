export { IpManager } from './core/IpManager.js';
export { validateLicense, evictLicenseCache, POLAR_ORGANIZATION_ID, POLAR_BENEFIT_IDS, FREE_TIER_MAX_DEVICES, FREE_TIER_MAX_HISTORY, } from './libs/license.js';
export type { LicenseTier, LicenseInfo } from './libs/license.js';
export type { IpManagerOptions, GeoData, IpEnrichment, IpSnapshot, IpIdentifyContext, IdentifyResult, EnrichedIdentifyResult, } from './types.js';
export { GeoEnricher } from './libs/enrichment/GeoEnricher.js';
export { ProxyEnricher } from './libs/enrichment/ProxyEnricher.js';
export { computeRiskScore } from './libs/enrichment/reputation.js';
export { AI_AGENT_CURATION_POLICY, AI_AGENT_PROVIDER_PROFILES, AI_AGENT_PROVIDER_RDAP_ALIASES, VERIFIED_AI_AGENT_RANGES, RDAP_ATTRIBUTED_AI_AGENT_RANGES, PARTNER_ATTRIBUTED_AI_AGENT_RANGES, CANDIDATE_AI_AGENT_RANGES, DEFAULT_AI_AGENT_RANGES, ALL_AI_AGENT_RANGES, getAiAgentRangesByConfidence, getAiAgentRangesByProvider, groupAiAgentRangesByProvider, } from './libs/enrichment/agents.js';
export { detectImpossibleTravel, computeRiskDelta, computeConsistencyScore, haversineKm, } from './libs/scoring.js';
export { createIpStorage } from './libs/adapters/inmemory.js';
export type { IpStorage } from './libs/adapters/inmemory.js';
export { createSqliteIpStorage } from './libs/adapters/sqlite.js';
export { createPostgresIpStorage } from './libs/adapters/postgres.js';
export type { AsyncIpStorage } from './libs/adapters/postgres.js';
export { createRedisIpStorage } from './libs/adapters/redis.js';
export { createIpMiddleware, resolveIp } from './libs/middleware.js';
export type { NextFunction } from './libs/middleware.js';
//# sourceMappingURL=main.d.ts.map