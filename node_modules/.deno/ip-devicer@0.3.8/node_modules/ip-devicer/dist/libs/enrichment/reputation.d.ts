import type { IpEnrichment, IpSnapshot } from '../../types.js';
interface ReputationInput extends Omit<IpEnrichment, 'riskScore' | 'riskFactors' | 'consistencyScore'> {
    deviceHistory: IpSnapshot[];
}
export declare function computeRiskScore(input: ReputationInput, enabled: boolean): {
    score: number;
    factors: string[];
};
export {};
//# sourceMappingURL=reputation.d.ts.map