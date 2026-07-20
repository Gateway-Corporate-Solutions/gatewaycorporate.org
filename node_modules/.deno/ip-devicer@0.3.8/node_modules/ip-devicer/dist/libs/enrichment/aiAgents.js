/**
 * Seed AI-agent ranges that are safe to ship by default.
 *
 * OpenAI publishes crawler IP feeds publicly. Anthropic and xAI do not publish
 * equivalent IP feeds in the sources reviewed for this implementation, so they
 * are intentionally left out of the runtime defaults until they can be curated
 * and verified via the maintenance workflow.
 */
export const DEFAULT_AI_AGENT_RANGES = [
    // OpenAI OAI-SearchBot — https://openai.com/searchbot.json
    { provider: 'openai', confidence: 'verified', source: 'OAI-SearchBot', cidr: '104.210.140.128/28' },
    { provider: 'openai', confidence: 'verified', source: 'OAI-SearchBot', cidr: '135.234.64.0/24' },
    { provider: 'openai', confidence: 'verified', source: 'OAI-SearchBot', cidr: '20.169.77.0/25' },
    { provider: 'openai', confidence: 'verified', source: 'OAI-SearchBot', cidr: '4.227.36.0/25' },
    { provider: 'openai', confidence: 'verified', source: 'OAI-SearchBot', cidr: '51.8.102.0/24' },
    { provider: 'openai', confidence: 'verified', source: 'OAI-SearchBot', cidr: '74.7.244.0/25' },
    // OpenAI GPTBot — https://openai.com/gptbot.json
    { provider: 'openai', confidence: 'verified', source: 'GPTBot', cidr: '132.196.86.0/24' },
    { provider: 'openai', confidence: 'verified', source: 'GPTBot', cidr: '172.182.202.0/25' },
    { provider: 'openai', confidence: 'verified', source: 'GPTBot', cidr: '20.171.206.0/24' },
    { provider: 'openai', confidence: 'verified', source: 'GPTBot', cidr: '52.230.152.0/24' },
    { provider: 'openai', confidence: 'verified', source: 'GPTBot', cidr: '74.7.227.0/25' },
    { provider: 'openai', confidence: 'verified', source: 'GPTBot', cidr: '74.7.241.0/25' },
    // OpenAI ChatGPT-User — https://openai.com/chatgpt-user.json
    { provider: 'openai', confidence: 'verified', source: 'ChatGPT-User', cidr: '104.210.139.192/28' },
    { provider: 'openai', confidence: 'verified', source: 'ChatGPT-User', cidr: '13.65.138.96/28' },
    { provider: 'openai', confidence: 'verified', source: 'ChatGPT-User', cidr: '20.169.78.128/28' },
    { provider: 'openai', confidence: 'verified', source: 'ChatGPT-User', cidr: '40.116.73.208/28' },
    { provider: 'openai', confidence: 'verified', source: 'ChatGPT-User', cidr: '52.173.219.96/28' },
    { provider: 'openai', confidence: 'verified', source: 'ChatGPT-User', cidr: '74.7.36.96/28' },
];
export const AI_AGENT_PROVIDER_RDAP_ALIASES = {
    openai: ['openai', 'open ai'],
    anthropic: ['anthropic', 'claude'],
    xai: ['xai', 'x.ai', 'grok'],
};
