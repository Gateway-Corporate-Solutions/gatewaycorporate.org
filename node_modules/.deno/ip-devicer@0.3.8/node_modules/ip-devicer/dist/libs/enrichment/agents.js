const RDAP_VERIFIED_AT = '2026-03-13';
export const AI_AGENT_PROVIDER_PROFILES = {
    openai: {
        provider: 'openai',
        displayName: 'OpenAI',
        aliases: ['openai', 'open ai', 'chatgpt', 'gptbot'],
        homepage: 'https://openai.com',
        notes: 'Strongest source quality in the catalog because OpenAI publishes crawler and user-triggered bot feeds.',
    },
    anthropic: {
        provider: 'anthropic',
        displayName: 'Anthropic',
        aliases: ['anthropic', 'claude'],
        homepage: 'https://www.anthropic.com',
        notes: 'No public bot IP feed was found during implementation; current entries stay below default confidence.',
    },
    xai: {
        provider: 'xai',
        displayName: 'xAI',
        aliases: ['xai', 'x.ai', 'grok'],
        homepage: 'https://x.ai',
        notes: 'Current attribution is based on provider domains fronted by Cloudflare rather than a published bot feed.',
    },
    google: {
        provider: 'google',
        displayName: 'Google',
        aliases: ['google', 'gemini', 'google ai'],
        homepage: 'https://ai.google.dev',
        notes: 'Representative Gemini API domain resolved to Google-owned space in RDAP.',
    },
    microsoft: {
        provider: 'microsoft',
        displayName: 'Microsoft',
        aliases: ['microsoft', 'copilot', 'azure'],
        homepage: 'https://copilot.microsoft.com',
        notes: 'Representative Copilot domain resolved behind Cloudflare, so entries remain partner-attributed.',
    },
    meta: {
        provider: 'meta',
        displayName: 'Meta',
        aliases: ['meta', 'facebook', 'meta ai'],
        homepage: 'https://ai.meta.com',
        notes: 'Representative Meta AI domain resolved to Meta-owned space in RDAP.',
    },
    mistral: {
        provider: 'mistral',
        displayName: 'Mistral AI',
        aliases: ['mistral', 'mistral ai'],
        homepage: 'https://mistral.ai',
        notes: 'Representative API domain resolved behind Cloudflare, so entries remain partner-attributed.',
    },
    cohere: {
        provider: 'cohere',
        displayName: 'Cohere',
        aliases: ['cohere'],
        homepage: 'https://cohere.com',
        notes: 'Representative API domain resolved to Google-owned space, so attribution depends on provider domain plus hosting partner.',
    },
    perplexity: {
        provider: 'perplexity',
        displayName: 'Perplexity',
        aliases: ['perplexity'],
        homepage: 'https://www.perplexity.ai',
        notes: 'Representative API domain resolved behind Cloudflare, so entries remain partner-attributed.',
    },
    groq: {
        provider: 'groq',
        displayName: 'Groq',
        aliases: ['groq'],
        homepage: 'https://groq.com',
        notes: 'Representative API domain resolved behind Cloudflare, so entries remain partner-attributed.',
    },
    together: {
        provider: 'together',
        displayName: 'Together AI',
        aliases: ['together', 'together ai'],
        homepage: 'https://together.ai',
        notes: 'Representative API domain resolved behind Cloudflare, so entries remain partner-attributed.',
    },
    huggingface: {
        provider: 'huggingface',
        displayName: 'Hugging Face',
        aliases: ['hugging face', 'huggingface'],
        homepage: 'https://huggingface.co',
        notes: 'Representative inference endpoint resolved to Amazon CloudFront space, so attribution depends on provider domain plus hosting partner.',
    },
    fireworks: {
        provider: 'fireworks',
        displayName: 'Fireworks AI',
        aliases: ['fireworks', 'fireworks ai'],
        homepage: 'https://fireworks.ai',
        notes: 'Representative API domain resolved to Google Cloud space, so attribution depends on provider domain plus hosting partner.',
    },
    writer: {
        provider: 'writer',
        displayName: 'Writer',
        aliases: ['writer'],
        homepage: 'https://writer.com',
        notes: 'Representative API domain resolved to Google-owned space, so attribution depends on provider domain plus hosting partner.',
    },
    deepseek: {
        provider: 'deepseek',
        displayName: 'DeepSeek',
        aliases: ['deepseek'],
        homepage: 'https://www.deepseek.com',
        notes: 'Representative API domain resolved to AWS CloudFront space, so entries remain partner-attributed.',
    },
};
export const AI_AGENT_CURATION_POLICY = [
    'verified: published provider-owned bot feed or equivalent public source',
    'rdap-attributed: representative provider domain resolves directly to provider-owned network space',
    'partner-attributed: representative provider domain resolves to a known CDN or cloud partner rather than provider-owned space',
    'candidate: domain ownership or RDAP match is too weak to promote above watchlist level',
];
export const VERIFIED_AI_AGENT_RANGES = [
    {
        provider: 'openai', confidence: 'verified', status: 'default', source: 'OAI-SearchBot', cidr: '104.210.140.128/28', trafficType: 'crawler',
        evidence: [{ type: 'published-feed', reference: 'https://openai.com/searchbot.json', note: 'OpenAI published crawler feed' }],
    },
    {
        provider: 'openai', confidence: 'verified', status: 'default', source: 'OAI-SearchBot', cidr: '135.234.64.0/24', trafficType: 'crawler',
        evidence: [{ type: 'published-feed', reference: 'https://openai.com/searchbot.json', note: 'OpenAI published crawler feed' }],
    },
    {
        provider: 'openai', confidence: 'verified', status: 'default', source: 'OAI-SearchBot', cidr: '20.169.77.0/25', trafficType: 'crawler',
        evidence: [{ type: 'published-feed', reference: 'https://openai.com/searchbot.json', note: 'OpenAI published crawler feed' }],
    },
    {
        provider: 'openai', confidence: 'verified', status: 'default', source: 'OAI-SearchBot', cidr: '4.227.36.0/25', trafficType: 'crawler',
        evidence: [{ type: 'published-feed', reference: 'https://openai.com/searchbot.json', note: 'OpenAI published crawler feed' }],
    },
    {
        provider: 'openai', confidence: 'verified', status: 'default', source: 'OAI-SearchBot', cidr: '51.8.102.0/24', trafficType: 'crawler',
        evidence: [{ type: 'published-feed', reference: 'https://openai.com/searchbot.json', note: 'OpenAI published crawler feed' }],
    },
    {
        provider: 'openai', confidence: 'verified', status: 'default', source: 'OAI-SearchBot', cidr: '74.7.244.0/25', trafficType: 'crawler',
        evidence: [{ type: 'published-feed', reference: 'https://openai.com/searchbot.json', note: 'OpenAI published crawler feed' }],
    },
    {
        provider: 'openai', confidence: 'verified', status: 'default', source: 'GPTBot', cidr: '132.196.86.0/24', trafficType: 'crawler',
        evidence: [{ type: 'published-feed', reference: 'https://openai.com/gptbot.json', note: 'OpenAI published crawler feed' }],
    },
    {
        provider: 'openai', confidence: 'verified', status: 'default', source: 'GPTBot', cidr: '172.182.202.0/25', trafficType: 'crawler',
        evidence: [{ type: 'published-feed', reference: 'https://openai.com/gptbot.json', note: 'OpenAI published crawler feed' }],
    },
    {
        provider: 'openai', confidence: 'verified', status: 'default', source: 'GPTBot', cidr: '20.171.206.0/24', trafficType: 'crawler',
        evidence: [{ type: 'published-feed', reference: 'https://openai.com/gptbot.json', note: 'OpenAI published crawler feed' }],
    },
    {
        provider: 'openai', confidence: 'verified', status: 'default', source: 'GPTBot', cidr: '52.230.152.0/24', trafficType: 'crawler',
        evidence: [{ type: 'published-feed', reference: 'https://openai.com/gptbot.json', note: 'OpenAI published crawler feed' }],
    },
    {
        provider: 'openai', confidence: 'verified', status: 'default', source: 'GPTBot', cidr: '74.7.227.0/25', trafficType: 'crawler',
        evidence: [{ type: 'published-feed', reference: 'https://openai.com/gptbot.json', note: 'OpenAI published crawler feed' }],
    },
    {
        provider: 'openai', confidence: 'verified', status: 'default', source: 'GPTBot', cidr: '74.7.241.0/25', trafficType: 'crawler',
        evidence: [{ type: 'published-feed', reference: 'https://openai.com/gptbot.json', note: 'OpenAI published crawler feed' }],
    },
    {
        provider: 'openai', confidence: 'verified', status: 'default', source: 'ChatGPT-User', cidr: '104.210.139.192/28', trafficType: 'user-triggered',
        evidence: [{ type: 'published-feed', reference: 'https://openai.com/chatgpt-user.json', note: 'OpenAI published user-triggered bot feed' }],
    },
    {
        provider: 'openai', confidence: 'verified', status: 'default', source: 'ChatGPT-User', cidr: '13.65.138.96/28', trafficType: 'user-triggered',
        evidence: [{ type: 'published-feed', reference: 'https://openai.com/chatgpt-user.json', note: 'OpenAI published user-triggered bot feed' }],
    },
    {
        provider: 'openai', confidence: 'verified', status: 'default', source: 'ChatGPT-User', cidr: '20.169.78.128/28', trafficType: 'user-triggered',
        evidence: [{ type: 'published-feed', reference: 'https://openai.com/chatgpt-user.json', note: 'OpenAI published user-triggered bot feed' }],
    },
    {
        provider: 'openai', confidence: 'verified', status: 'default', source: 'ChatGPT-User', cidr: '40.116.73.208/28', trafficType: 'user-triggered',
        evidence: [{ type: 'published-feed', reference: 'https://openai.com/chatgpt-user.json', note: 'OpenAI published user-triggered bot feed' }],
    },
    {
        provider: 'openai', confidence: 'verified', status: 'default', source: 'ChatGPT-User', cidr: '52.173.219.96/28', trafficType: 'user-triggered',
        evidence: [{ type: 'published-feed', reference: 'https://openai.com/chatgpt-user.json', note: 'OpenAI published user-triggered bot feed' }],
    },
    {
        provider: 'openai', confidence: 'verified', status: 'default', source: 'ChatGPT-User', cidr: '74.7.36.96/28', trafficType: 'user-triggered',
        evidence: [{ type: 'published-feed', reference: 'https://openai.com/chatgpt-user.json', note: 'OpenAI published user-triggered bot feed' }],
    },
];
export const RDAP_ATTRIBUTED_AI_AGENT_RANGES = [
    {
        provider: 'google', confidence: 'rdap-attributed', status: 'extended', source: 'Gemini API sample', cidr: '142.250.189.138/32', trafficType: 'provider-infrastructure',
        evidence: [{ type: 'rdap-sample', reference: 'generativelanguage.googleapis.com', sampleIp: '142.250.189.138', rdapOrg: 'GOOGLE', verifiedAt: RDAP_VERIFIED_AT }],
        notes: 'Representative Gemini API domain resolved directly to Google-owned space.',
    },
    {
        provider: 'meta', confidence: 'rdap-attributed', status: 'extended', source: 'Meta AI sample', cidr: '157.240.254.12/32', trafficType: 'provider-infrastructure',
        evidence: [{ type: 'rdap-sample', reference: 'ai.meta.com', sampleIp: '157.240.254.12', rdapOrg: 'THEFA-3', verifiedAt: RDAP_VERIFIED_AT, note: 'Meta/Facebook-owned addressing' }],
        notes: 'Representative Meta AI domain resolved directly to Meta-owned space.',
    },
];
export const PARTNER_ATTRIBUTED_AI_AGENT_RANGES = [
    {
        provider: 'xai', confidence: 'partner-attributed', status: 'extended', source: 'xAI API sample', cidr: '104.18.19.80/32', trafficType: 'agent-runtime',
        evidence: [{ type: 'rdap-sample', reference: 'api.x.ai', sampleIp: '104.18.19.80', rdapOrg: 'CLOUDFLARENET', verifiedAt: RDAP_VERIFIED_AT }],
        notes: 'Provider domain attribution is strong, but the resolved IP belongs to Cloudflare rather than xAI directly.',
    },
    {
        provider: 'microsoft', confidence: 'partner-attributed', status: 'extended', source: 'Copilot sample', cidr: '104.18.22.222/32', trafficType: 'provider-infrastructure',
        evidence: [{ type: 'rdap-sample', reference: 'copilot.microsoft.com', sampleIp: '104.18.22.222', rdapOrg: 'CLOUDFLARENET', verifiedAt: RDAP_VERIFIED_AT }],
        notes: 'Representative Copilot domain resolved behind Cloudflare.',
    },
    {
        provider: 'mistral', confidence: 'partner-attributed', status: 'extended', source: 'Mistral API sample', cidr: '104.18.22.152/32', trafficType: 'agent-runtime',
        evidence: [{ type: 'rdap-sample', reference: 'api.mistral.ai', sampleIp: '104.18.22.152', rdapOrg: 'CLOUDFLARENET', verifiedAt: RDAP_VERIFIED_AT }],
        notes: 'Representative Mistral API domain resolved behind Cloudflare.',
    },
    {
        provider: 'cohere', confidence: 'partner-attributed', status: 'extended', source: 'Cohere API sample', cidr: '34.96.76.122/32', trafficType: 'agent-runtime',
        evidence: [{ type: 'rdap-sample', reference: 'api.cohere.com', sampleIp: '34.96.76.122', rdapOrg: 'GOOGL-2', verifiedAt: RDAP_VERIFIED_AT }],
        notes: 'Representative Cohere API domain resolved to Google-hosted space rather than a Cohere-owned network block.',
    },
    {
        provider: 'perplexity', confidence: 'partner-attributed', status: 'extended', source: 'Perplexity API sample', cidr: '104.18.26.48/32', trafficType: 'agent-runtime',
        evidence: [{ type: 'rdap-sample', reference: 'api.perplexity.ai', sampleIp: '104.18.26.48', rdapOrg: 'CLOUDFLARENET', verifiedAt: RDAP_VERIFIED_AT }],
        notes: 'Representative Perplexity API domain resolved behind Cloudflare.',
    },
    {
        provider: 'groq', confidence: 'partner-attributed', status: 'extended', source: 'Groq API sample', cidr: '172.64.149.20/32', trafficType: 'agent-runtime',
        evidence: [{ type: 'rdap-sample', reference: 'api.groq.com', sampleIp: '172.64.149.20', rdapOrg: 'CLOUDFLARENET', verifiedAt: RDAP_VERIFIED_AT }],
        notes: 'Representative Groq API domain resolved behind Cloudflare.',
    },
    {
        provider: 'together', confidence: 'partner-attributed', status: 'extended', source: 'Together API sample', cidr: '172.64.144.98/32', trafficType: 'agent-runtime',
        evidence: [{ type: 'rdap-sample', reference: 'api.together.xyz', sampleIp: '172.64.144.98', rdapOrg: 'CLOUDFLARENET', verifiedAt: RDAP_VERIFIED_AT }],
        notes: 'Representative Together API domain resolved behind Cloudflare.',
    },
    {
        provider: 'huggingface', confidence: 'partner-attributed', status: 'extended', source: 'Hugging Face inference sample', cidr: '18.160.181.69/32', trafficType: 'agent-runtime',
        evidence: [{ type: 'rdap-sample', reference: 'api-inference.huggingface.co', sampleIp: '18.160.181.69', rdapOrg: 'AMAZON-CF', verifiedAt: RDAP_VERIFIED_AT }],
        notes: 'Representative inference endpoint resolved to Amazon CloudFront space.',
    },
    {
        provider: 'fireworks', confidence: 'partner-attributed', status: 'extended', source: 'Fireworks API sample', cidr: '35.209.59.6/32', trafficType: 'agent-runtime',
        evidence: [{ type: 'rdap-sample', reference: 'api.fireworks.ai', sampleIp: '35.209.59.6', rdapOrg: 'GOOGLE-CLOUD', verifiedAt: RDAP_VERIFIED_AT }],
        notes: 'Representative Fireworks API domain resolved to Google Cloud space.',
    },
    {
        provider: 'writer', confidence: 'partner-attributed', status: 'extended', source: 'Writer API sample', cidr: '34.49.62.108/32', trafficType: 'agent-runtime',
        evidence: [{ type: 'rdap-sample', reference: 'api.writer.com', sampleIp: '34.49.62.108', rdapOrg: 'GOOGL-2', verifiedAt: RDAP_VERIFIED_AT }],
        notes: 'Representative Writer API domain resolved to Google-hosted space.',
    },
    {
        provider: 'deepseek', confidence: 'partner-attributed', status: 'extended', source: 'DeepSeek API sample', cidr: '3.173.21.63/32', trafficType: 'agent-runtime',
        evidence: [{ type: 'rdap-sample', reference: 'api.deepseek.com', sampleIp: '3.173.21.63', rdapOrg: 'AWS-CLOUDFRONT', verifiedAt: RDAP_VERIFIED_AT }],
        notes: 'Representative DeepSeek API domain resolved to AWS CloudFront space.',
    },
];
export const CANDIDATE_AI_AGENT_RANGES = [
    {
        provider: 'anthropic', confidence: 'candidate', status: 'candidate', source: 'Anthropic API sample', cidr: '160.79.104.10/32', trafficType: 'agent-runtime',
        evidence: [{ type: 'rdap-sample', reference: 'api.anthropic.com', sampleIp: '160.79.104.10', rdapOrg: 'AP-2440', verifiedAt: RDAP_VERIFIED_AT }],
        notes: 'Representative Anthropic API domain resolved to a non-obvious RDAP org string, so it remains watchlist-only until attribution is reviewed manually.',
    },
];
/**
 * Default ranges are intentionally conservative to avoid broad false positives
 * if this module is wired into runtime classification. Verified feed-backed
 * OpenAI ranges are included here; lower-confidence ranges remain in the
 * extended and candidate collections until explicitly promoted.
 */
export const DEFAULT_AI_AGENT_RANGES = [...VERIFIED_AI_AGENT_RANGES];
export const ALL_AI_AGENT_RANGES = [
    ...VERIFIED_AI_AGENT_RANGES,
    ...RDAP_ATTRIBUTED_AI_AGENT_RANGES,
    ...PARTNER_ATTRIBUTED_AI_AGENT_RANGES,
    ...CANDIDATE_AI_AGENT_RANGES,
];
export const AI_AGENT_PROVIDER_RDAP_ALIASES = {
    openai: [...AI_AGENT_PROVIDER_PROFILES.openai.aliases],
    anthropic: [...AI_AGENT_PROVIDER_PROFILES.anthropic.aliases],
    xai: [...AI_AGENT_PROVIDER_PROFILES.xai.aliases],
    google: [...AI_AGENT_PROVIDER_PROFILES.google.aliases],
    microsoft: [...AI_AGENT_PROVIDER_PROFILES.microsoft.aliases],
    meta: [...AI_AGENT_PROVIDER_PROFILES.meta.aliases],
    mistral: [...AI_AGENT_PROVIDER_PROFILES.mistral.aliases],
    cohere: [...AI_AGENT_PROVIDER_PROFILES.cohere.aliases],
    perplexity: [...AI_AGENT_PROVIDER_PROFILES.perplexity.aliases],
    groq: [...AI_AGENT_PROVIDER_PROFILES.groq.aliases],
    together: [...AI_AGENT_PROVIDER_PROFILES.together.aliases],
    huggingface: [...AI_AGENT_PROVIDER_PROFILES.huggingface.aliases],
    fireworks: [...AI_AGENT_PROVIDER_PROFILES.fireworks.aliases],
    writer: [...AI_AGENT_PROVIDER_PROFILES.writer.aliases],
    deepseek: [...AI_AGENT_PROVIDER_PROFILES.deepseek.aliases],
};
export function getAiAgentRangesByConfidence(confidence) {
    return ALL_AI_AGENT_RANGES.filter((entry) => entry.confidence === confidence);
}
export function getAiAgentRangesByProvider(provider) {
    return ALL_AI_AGENT_RANGES.filter((entry) => entry.provider === provider);
}
export function groupAiAgentRangesByProvider(ranges = ALL_AI_AGENT_RANGES) {
    return {
        openai: ranges.filter((entry) => entry.provider === 'openai'),
        anthropic: ranges.filter((entry) => entry.provider === 'anthropic'),
        xai: ranges.filter((entry) => entry.provider === 'xai'),
        google: ranges.filter((entry) => entry.provider === 'google'),
        microsoft: ranges.filter((entry) => entry.provider === 'microsoft'),
        meta: ranges.filter((entry) => entry.provider === 'meta'),
        mistral: ranges.filter((entry) => entry.provider === 'mistral'),
        cohere: ranges.filter((entry) => entry.provider === 'cohere'),
        perplexity: ranges.filter((entry) => entry.provider === 'perplexity'),
        groq: ranges.filter((entry) => entry.provider === 'groq'),
        together: ranges.filter((entry) => entry.provider === 'together'),
        huggingface: ranges.filter((entry) => entry.provider === 'huggingface'),
        fireworks: ranges.filter((entry) => entry.provider === 'fireworks'),
        writer: ranges.filter((entry) => entry.provider === 'writer'),
        deepseek: ranges.filter((entry) => entry.provider === 'deepseek'),
    };
}
