import { Injectable } from '@nestjs/common';
import { CalibratedProbability, calibrated, EvidenceQuality } from '../common/types/cognitive.types';
import { CognitiveConfigService } from './cognitive-config.service';

/**
 * BayesianUpdaterService: Bayesian belief update engine.
 *
 * Provides calibrated probability updates using evidence-weighted Bayesian inference.
 * All confidence values are calibrated (mean + spread) to avoid overconfident point
 * estimates. Evidence quality modulates the strength of belief updates.
 */
@Injectable()
export class BayesianUpdaterService {
  constructor(private readonly config: CognitiveConfigService) {}

  private getEvidenceWeight(quality: EvidenceQuality): number {
    const map: Record<EvidenceQuality, string> = {
      explicit_statement: 'evidence.explicit_statement',
      strong_implication: 'evidence.strong_implication',
      behavioral_pattern: 'evidence.behavioral_pattern',
      weak_inference: 'evidence.weak_inference',
    };
    return this.config.get(map[quality]);
  }

  /**
   * Compute posterior probability using Beta distribution conjugate prior.
   * Returns calibrated probability with credible interval from Beta(alpha, beta).
   *
   * @param successes - Number of observed successes
   * @param total - Total number of observations
   */
  betaPosterior(successes: number, total: number): CalibratedProbability {
    const alpha = successes + 1;
    const beta_ = (total - successes) + 1;
    const mean = alpha / (alpha + beta_);
    const variance = (alpha * beta_) / ((alpha + beta_) ** 2 * (alpha + beta_ + 1));
    const z = this.config.get('bayesian.ci_z_score');
    const spread = z * Math.sqrt(variance);
    return calibrated(mean, spread);
  }

  /**
   * Update confidence given new evidence. Boost is proportional to evidence quality
   * and inversely proportional to current confidence (diminishing returns).
   * Spread narrows with more evidence (epistemic uncertainty decreases).
   *
   * @param currentConfidence - Current belief confidence (0-1)
   * @param evidenceQuality - Quality tier of the new evidence
   * @param evidenceCount - Total evidence count (including this update)
   */
  updateWithEvidence(
    currentConfidence: number,
    evidenceQuality: EvidenceQuality,
    evidenceCount: number,
  ): CalibratedProbability {
    const weight = this.getEvidenceWeight(evidenceQuality);
    const learningRate = this.config.get('bayesian.learning_rate');
    const boost = weight * (1 - currentConfidence) * learningRate;
    const newConfidence = Math.min(1.0, currentConfidence + boost);
    const spread = 0.15 / Math.sqrt(1 + evidenceCount);
    return calibrated(newConfidence, spread);
  }

  /**
   * Compute decay rate adjusted for evidence count. More evidence = slower decay
   * (well-supported beliefs persist longer). Uses log2 scaling for diminishing returns.
   *
   * @param baseRate - Base decay rate before evidence adjustment
   * @param evidenceCount - Number of supporting evidence instances
   */
  evidenceWeightedDecayRate(baseRate: number, evidenceCount: number): number {
    return baseRate / Math.log2(1 + Math.max(1, evidenceCount));
  }

  /**
   * Get context-specific decay multiplier. Different knowledge scopes decay at
   * different rates (e.g., values decay slowly, tool knowledge decays faster).
   *
   * @param scope - Knowledge scope (e.g., 'tools', 'values', 'technical')
   */
  contextDecayMultiplier(scope: string): number {
    const key = `context_decay.${scope}`;
    return this.config.get(key) || 1.0;
  }

  /**
   * Compute prior probability for a belief class. Base priors vary by class
   * (axioms start high, hypotheses start low) with a small evidence boost.
   *
   * @param beliefClass - Category of belief (e.g., 'axiom', 'hypothesis', 'fact')
   * @param evidenceCount - Number of supporting evidence instances
   */
  computePrior(beliefClass: string, evidenceCount: number): number {
    const BASE_PRIORS: Record<string, number> = {
      axiom: 1.0, self_model: 0.85, user_model: 0.6,
      operational: 0.4, hypothesis: 0.2,
      fact: 0.5, inference: 0.3, procedural: 0.6, meta: 0.4,
    };
    const base = BASE_PRIORS[beliefClass] ?? 0.3;
    const evidenceBoost = Math.min(0.15, evidenceCount * 0.02);
    return Math.min(0.95, base + evidenceBoost);
  }

  /**
   * Compute confidence boost from reinforcement (seeing the same belief again).
   * Capped to prevent runaway confidence. Larger boost for lower confidence
   * (diminishing returns as confidence approaches 1.0).
   *
   * @param currentConfidence - Current belief confidence (0-1)
   * @param evidenceQuality - Quality of the reinforcing evidence
   */
  reinforcementBoost(currentConfidence: number, evidenceQuality: EvidenceQuality): number {
    const weight = this.getEvidenceWeight(evidenceQuality);
    const cap = this.config.get('bayesian.reinforcement_boost_cap');
    return Math.min(cap, weight * (1.0 - currentConfidence) * this.config.get('bayesian.learning_rate'));
  }
}
