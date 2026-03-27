import { Injectable, Logger } from '@nestjs/common';

/**
 * AttentionService: Learned selective focus over modalities.
 *
 * Not all events processed equally. Attention is:
 * - SELECTIVE: some modalities get deep processing, others shallow
 * - LEARNED: gradient descent on which modalities reduce prediction error
 * - CAPTURABLE: surprise/salience events override voluntary attention
 * - ADAPTIVE: switches when current focus stops being productive
 *
 * Like a child in a room: learns to attend to mama's voice (most informative),
 * ignore background hum, snap to loud noise (involuntary capture).
 *
 * Attention weights → softmax → distribution over modalities
 * Loss = prediction error in attended domains
 * ∂Loss/∂weights → gradient update
 */

const MAX_MODALITIES = 20;

@Injectable()
export class AttentionService {
  private readonly logger = new Logger(AttentionService.name);

  // Learned attention weights (one per discovered modality)
  private weights: number[] = [];
  private lr = 0.05;

  // Tracking for gradient computation
  private lastAttention: number[] = [];
  private lastPredictionErrors: number[] = [];
  private focusDuration: number[] = []; // how long each modality has been attended
  private surpriseOverride: number | null = null; // involuntary capture

  /**
   * Compute attention distribution over modalities.
   * Returns probability-like weights: which modalities to process deeply.
   */
  attend(modalityCount: number): number[] {
    // Ensure weights array matches modality count
    while (this.weights.length < modalityCount) {
      this.weights.push(0); // new modality starts neutral
      this.focusDuration.push(0);
    }

    // Softmax over weights
    const scores = this.weights.slice(0, modalityCount).map((w, i) => {
      let score = w;
      // Fatigue: sustained attention on one modality decays
      score -= this.focusDuration[i] * 0.02;
      return score;
    });

    // Involuntary capture: surprise overrides voluntary attention
    if (this.surpriseOverride !== null && this.surpriseOverride < modalityCount) {
      scores[this.surpriseOverride] += 3.0; // strong bias toward surprise source
      this.surpriseOverride = null; // one-shot
    }

    this.lastAttention = this.softmax(scores);

    // Update focus duration
    const maxIdx = this.lastAttention.indexOf(Math.max(...this.lastAttention));
    for (let i = 0; i < this.focusDuration.length; i++) {
      if (i === maxIdx) this.focusDuration[i]++;
      else this.focusDuration[i] = Math.max(0, this.focusDuration[i] - 1);
    }

    return this.lastAttention;
  }

  /**
   * Report prediction error per modality after processing.
   * Used for gradient descent: modalities that reduce error when attended → ↑
   */
  reportErrors(errorsPerModality: number[]): void {
    this.lastPredictionErrors = errorsPerModality;
    this.updateWeights();
  }

  /**
   * Involuntary capture: a surprise event from a modality grabs attention.
   * Next attend() call will strongly bias toward this modality.
   */
  capture(modalityId: number): void {
    this.surpriseOverride = modalityId;
    this.focusDuration.fill(0); // surprise resets fatigue
    this.logger.log(`Attention CAPTURED by modality #${modalityId}`);
  }

  /**
   * Gradient update: if attending to modality i reduces prediction error → ↑ weight
   */
  private updateWeights(): void {
    if (this.lastAttention.length === 0 || this.lastPredictionErrors.length === 0) return;

    const n = Math.min(this.lastAttention.length, this.lastPredictionErrors.length, this.weights.length);

    for (let i = 0; i < n; i++) {
      // Gradient: ∂Loss/∂weight_i ≈ attention_i * error_i
      // If high attention AND high error → weight too high, decrease
      // If high attention AND low error → weight good, reinforce slightly
      const error = this.lastPredictionErrors[i] || 0;
      const attention = this.lastAttention[i] || 0;

      // Simple policy gradient: reward low-error attended modalities
      const reward = -error; // negative error = positive reward
      const gradient = attention * reward;

      this.weights[i] += this.lr * this.clamp(gradient, -1, 1);
      this.weights[i] = this.clamp(this.weights[i], -3, 3); // prevent explosion
    }
  }

  /**
   * Get attention level for a specific modality.
   * Used by kernel to decide processing depth:
   *   > 0.3 → deep processing (LLM budget allocated)
   *   0.1-0.3 → normal processing
   *   < 0.1 → shallow (fast-path only, light trace)
   */
  getAttentionLevel(modalityId: number): number {
    if (modalityId >= this.lastAttention.length) return 0.5; // unknown → moderate
    return this.lastAttention[modalityId];
  }

  /**
   * What is the system currently focused on?
   */
  getFocusReport(): { focused_modality: number; attention_distribution: number[]; focus_durations: number[] } {
    const maxIdx = this.lastAttention.length > 0
      ? this.lastAttention.indexOf(Math.max(...this.lastAttention))
      : -1;
    return {
      focused_modality: maxIdx,
      attention_distribution: [...this.lastAttention],
      focus_durations: [...this.focusDuration],
    };
  }

  private softmax(scores: number[]): number[] {
    if (scores.length === 0) return [];
    const maxScore = Math.max(...scores);
    const exps = scores.map(s => Math.exp(s - maxScore));
    const sum = exps.reduce((s, e) => s + e, 0);
    return exps.map(e => e / Math.max(0.001, sum));
  }

  private clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }
}
