import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SurrealService } from '../../database/surreal.service';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';
import { CommitDelta, TimeSense } from '../kernel.types';

/**
 * AffectiveStateService: Learned homeostatic affect via gradient descent.
 *
 * NOT config.adjust(). NOT if/then. A DIFFERENTIABLE MODEL:
 *
 *   accumulators × W₁ → hormone_logits → sigmoid → hormone_levels
 *   hormone_levels × W₂ → config_deltas (proportional modulation)
 *   hormone_levels → softmax → mode probabilities (explore/exploit/defensive/resting)
 *
 * Loss = prediction_error_rate + pain_accumulator - reward_accumulator
 * ∂Loss/∂W computed analytically, weights updated via gradient descent.
 *
 * ~40 learnable parameters, pure TypeScript, no external ML library.
 */

// Dimensions
const N_ACCUMULATORS = 7;  // pred_error, tension, pain, convergence, reward, novelty, stability
const N_HORMONES = 4;      // cortisol, dopamine, norepinephrine, serotonin
const N_MODES = 4;         // explore, exploit, defensive, resting
const N_CONFIG_TARGETS = 6; // convergence_threshold, spread_factor, hebbian_lr, energy_threshold, activation_boost, freshness_decay

// Config keys that affect modulates
const CONFIG_TARGETS = [
  'kernel.convergence_threshold',
  'kernel.spread_factor',
  'kernel.hebbian_learning_rate',
  'kernel.energy_stable_threshold',
  'kernel.activation_boost',
  'kernel.freshness_decay',
];

export interface HormoneLevels {
  cortisol: number;
  dopamine: number;
  norepinephrine: number;
  serotonin: number;
}

export interface Pain {
  intensity: number;
  source: string;
  chronic: boolean;
  accumulator: number;
  cycles_unresolved: number;
}

export interface AffectiveSnapshot {
  hormones: HormoneLevels;
  pain: Pain;
  valence: number;
  arousal: number;
  mode: 'explore' | 'exploit' | 'defensive' | 'resting';
  mode_probabilities: number[];
  loss: number;
}

/** Learnable weights — persisted in SurrealDB */
interface AffectWeights {
  W1: number[][];     // [N_ACCUMULATORS × N_HORMONES] — accumulators → hormones
  W2: number[][];     // [N_HORMONES × N_CONFIG_TARGETS] — hormones → config deltas
  W_mode: number[][]; // [N_HORMONES × N_MODES] — hormones → mode logits
  learning_rate: number;
  step_count: number;
}

@Injectable()
export class AffectiveStateService implements OnModuleInit {
  private readonly logger = new Logger(AffectiveStateService.name);

  // Raw accumulators (running state)
  private acc: number[] = new Array(N_ACCUMULATORS).fill(0); // [pred_error, tension, pain, convergence, reward, novelty, stability]
  private painCyclesUnresolved = 0;
  private lastPainSource = 'none';
  private lastLoss = 0;

  // Learnable weights
  private W1!: number[][];
  private W2!: number[][];
  private W_mode!: number[][];
  private lr = 0.01;
  private stepCount = 0;

  // Cached forward pass (for backward pass)
  private lastHormones: number[] = new Array(N_HORMONES).fill(0.5);
  private lastHormoneLogits: number[] = new Array(N_HORMONES).fill(0);
  private lastConfigDeltas: number[] = new Array(N_CONFIG_TARGETS).fill(0);
  private lastModeProbs: number[] = new Array(N_MODES).fill(0.25);

  constructor(
    private readonly db: SurrealService,
    private readonly config: CognitiveConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadOrInitWeights();
    // Run one forward pass to initialize hormones from current weights
    this.forward();
  }

  // ═══════════════════════════════════════════
  // FORWARD PASS
  // ═══════════════════════════════════════════

  /**
   * Process commits → update accumulators → forward pass → compute loss → backward pass → update weights.
   * Returns config deltas to apply.
   */
  processCommits(commits: CommitDelta[], timeSense: TimeSense): { configDeltas: Map<string, number> } {
    // 1. Update accumulators from system dynamics
    this.updateAccumulators(commits, timeSense);

    // 2. Forward pass: accumulators → hormones → config deltas + mode
    const hormones = this.forward();

    // 3. Compute loss
    const loss = this.computeLoss();

    // 4. Backward pass: compute gradients, update weights
    this.backward(loss);

    // 5. Build config deltas
    const deltas = new Map<string, number>();
    for (let i = 0; i < N_CONFIG_TARGETS; i++) {
      if (Math.abs(this.lastConfigDeltas[i]) > 0.0001) {
        deltas.set(CONFIG_TARGETS[i], this.lastConfigDeltas[i]);
      }
    }

    this.lastLoss = loss;
    return { configDeltas: deltas };
  }

  /**
   * Forward pass through the learned model.
   */
  private forward(): number[] {
    // Layer 1: accumulators × W1 → hormone logits → sigmoid → hormones
    for (let j = 0; j < N_HORMONES; j++) {
      let sum = 0;
      for (let i = 0; i < N_ACCUMULATORS; i++) {
        sum += this.acc[i] * this.W1[i][j];
      }
      this.lastHormoneLogits[j] = sum;
      this.lastHormones[j] = this.sigmoid(sum);
    }

    // Layer 2: hormones × W2 → config deltas (tanh to bound [-1, 1], then scale)
    for (let j = 0; j < N_CONFIG_TARGETS; j++) {
      let sum = 0;
      for (let i = 0; i < N_HORMONES; i++) {
        sum += this.lastHormones[i] * this.W2[i][j];
      }
      this.lastConfigDeltas[j] = Math.tanh(sum) * this.config.get('affect.config_delta_max');
    }

    // Mode: hormones × W_mode → softmax → probabilities
    const modeLogits = new Array(N_MODES).fill(0) as number[];
    for (let j = 0; j < N_MODES; j++) {
      let sum = 0;
      for (let i = 0; i < N_HORMONES; i++) {
        sum += this.lastHormones[i] * this.W_mode[i][j];
      }
      modeLogits[j] = sum;
    }
    this.lastModeProbs = this.softmax(modeLogits) as number[];

    return this.lastHormones;
  }

  // ═══════════════════════════════════════════
  // LOSS & BACKWARD PASS
  // ═══════════════════════════════════════════

  /**
   * Loss = pain + prediction_error - reward - convergence.
   * System wants to MINIMIZE this → learn to reduce pain/error and maximize reward.
   */
  private computeLoss(): number {
    return this.acc[0] + this.acc[2] - this.acc[3] - this.acc[4]; // pred_error + pain - convergence - reward
  }

  /**
   * Backward pass: analytical gradients for the 2-layer model.
   * ∂Loss/∂W1 = ∂Loss/∂hormones × ∂hormones/∂W1
   * Uses cached forward pass values.
   */
  private backward(loss: number): void {
    // Gradient of loss w.r.t. hormones
    // Loss = f(accumulators) — hormones influence loss INDIRECTLY through config modulation
    // We use the loss magnitude as a global signal: if loss is high, strengthen the
    // pathways that reduce it (convergence, reward) and weaken those that increase it (error, pain)

    // ∂loss/∂hormone_j ≈ sign based on which accumulators this hormone is connected to
    const dL_dH = new Array(N_HORMONES).fill(0) as number[];
    for (let j = 0; j < N_HORMONES; j++) {
      let grad = 0;
      for (let i = 0; i < N_ACCUMULATORS; i++) {
        // Accumulators 0,1,2 (error, tension, pain) increase loss → positive gradient
        // Accumulators 3,4 (convergence, reward) decrease loss → negative gradient
        const lossSign = i <= 2 ? 1.0 : -1.0;
        grad += lossSign * this.W1[i][j] * this.acc[i];
      }
      dL_dH[j] = grad;
    }

    // ∂sigmoid/∂logit = sigmoid * (1 - sigmoid)
    const dSigmoid = new Array(N_HORMONES).fill(0) as number[];
    for (let j = 0; j < N_HORMONES; j++) {
      dSigmoid[j] = this.lastHormones[j] * (1 - this.lastHormones[j]);
    }

    // NOTE: W1 gradient is approximate — true gradient requires temporal credit assignment
    // through config deltas. Using REINFORCE-style sign-based update as practical approximation.
    // Update W1: ∂Loss/∂W1[i][j] = ∂Loss/∂h_j × ∂h_j/∂logit_j × ∂logit_j/∂W1[i][j]
    //                                = dL_dH[j] × dSigmoid[j] × acc[i]
    for (let i = 0; i < N_ACCUMULATORS; i++) {
      for (let j = 0; j < N_HORMONES; j++) {
        const grad = dL_dH[j] * dSigmoid[j] * this.acc[i];
        this.W1[i][j] -= this.lr * this.clampGrad(grad);
      }
    }

    // Update W2: gradient toward reducing loss through config modulation
    // If loss is positive and config delta is in the wrong direction → adjust
    const lossSign = Math.sign(loss);
    for (let i = 0; i < N_HORMONES; i++) {
      for (let j = 0; j < N_CONFIG_TARGETS; j++) {
        // Gradient: push config deltas in the direction that reduces loss
        const grad = lossSign * this.lastHormones[i] * this.lastConfigDeltas[j];
        this.W2[i][j] -= this.lr * this.clampGrad(grad);
      }
    }

    // Update W_mode: cross-entropy-like gradient
    // Encourage mode that minimizes loss
    // If loss > 0 → defensive/exploit should be higher (reduce risk)
    // If loss < 0 → explore should be higher (we're doing well, explore more)
    const targetMode = loss > this.config.get('affect.mode_boundary_positive') ? 2 : loss < this.config.get('affect.mode_boundary_negative') ? 0 : 1; // defensive / explore / exploit
    for (let i = 0; i < N_HORMONES; i++) {
      for (let j = 0; j < N_MODES; j++) {
        const target = j === targetMode ? 1 : 0;
        const grad = (this.lastModeProbs[j] - target) * this.lastHormones[i];
        this.W_mode[i][j] -= this.lr * this.clampGrad(grad);
      }
    }

    this.stepCount++;

    // Persist weights periodically (not every step — expensive)
    if (this.stepCount % 10 === 0) {
      this.persistWeights().catch(() => {});
    }
  }

  // ═══════════════════════════════════════════
  // ACCUMULATOR UPDATE
  // ═══════════════════════════════════════════

  private updateAccumulators(commits: CommitDelta[], timeSense: TimeSense): void {
    const decayRate = this.config.get('affect.accumulator_decay_rate');

    if (commits.length > 0) {
      const avgPredError = commits.reduce((s, c) => s + c.prediction_error, 0) / commits.length;
      const avgNovelty = commits.reduce((s, c) => s + c.novelty_cost, 0) / commits.length;
      const avgUrgency = commits.reduce((s, c) => s + c.urgency, 0) / commits.length;
      const totalEnergy = commits.reduce((s, c) => s + c.energy, 0);
      const convergent = commits.filter(c => c.convergence_score > 0.3).length;
      const escalations = commits.filter(c => c.is_escalation).length;

      // Every commit represents cognitive work → base accumulation
      const baseActivity = Math.min(1, commits.length * 0.15);

      this.acc[0] += avgPredError + avgUrgency * 0.3 + baseActivity * 0.2;  // prediction_error + arousal
      this.acc[1] += escalations * 0.3 + baseActivity * 0.1;                 // tension
      // acc[2] (pain) only via inflictPain()
      this.acc[3] += convergent * 0.2 + (1 - avgPredError) * baseActivity * 0.1; // convergence (less error = more)
      // acc[4] (reward) only via reward()
      this.acc[5] += avgNovelty + baseActivity * 0.3;                         // novelty (always some with new events)
      this.acc[6] += (1 - timeSense.novelty_rate) * 0.2;                     // stability
    }

    // TimeSense-driven arousal: fast tempo → more pred_error accumulator
    if (timeSense.tempo > 0.3) {
      this.acc[0] += timeSense.tempo * 0.1;
      this.acc[5] += timeSense.novelty_rate * 0.1;
    }

    // Pain tracking
    if (this.acc[2] > 0.1) {
      this.painCyclesUnresolved++;
    } else {
      this.painCyclesUnresolved = 0;
    }

    // Decay all accumulators (slow)
    for (let i = 0; i < N_ACCUMULATORS; i++) {
      this.acc[i] *= (1 - decayRate);
      this.acc[i] = Math.max(0, Math.min(5, this.acc[i]));
    }
  }

  // ═══════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════

  getSnapshot(): AffectiveSnapshot {
    const hormones = this.deriveHormones();
    const modeNames: Array<AffectiveSnapshot['mode']> = ['explore', 'exploit', 'defensive', 'resting'];
    const modeIdx = this.lastModeProbs.indexOf(Math.max(...Array.from(this.lastModeProbs)));

    return {
      hormones,
      pain: {
        intensity: this.sigmoid(this.acc[2]),
        source: this.lastPainSource,
        chronic: this.painCyclesUnresolved > 5,
        accumulator: Math.round(this.acc[2] * 1000) / 1000,
        cycles_unresolved: this.painCyclesUnresolved,
      },
      valence: Math.max(-1, Math.min(1,
        Math.round((hormones.dopamine + hormones.serotonin - hormones.cortisol - this.sigmoid(this.acc[2])) * 100) / 100)),
      arousal: Math.max(0, Math.min(1,
        Math.round((hormones.norepinephrine + hormones.cortisol) / 2 * 100) / 100)),
      mode: modeNames[modeIdx] || 'exploit',
      mode_probabilities: Array.from(this.lastModeProbs).map(p => Math.round(p * 1000) / 1000),
      loss: Math.round(this.lastLoss * 1000) / 1000,
    };
  }

  deriveHormones(): HormoneLevels {
    return {
      cortisol: Math.round(this.lastHormones[0] * 1000) / 1000,
      dopamine: Math.round(this.lastHormones[1] * 1000) / 1000,
      norepinephrine: Math.round(this.lastHormones[2] * 1000) / 1000,
      serotonin: Math.round(this.lastHormones[3] * 1000) / 1000,
    };
  }

  inflictPain(source: string, amount: number): void {
    this.acc[2] += amount;
    this.acc[0] += amount * 0.5; // pain → prediction error
    this.lastPainSource = source;
    this.painCyclesUnresolved = 0;
  }

  reward(amount: number): void {
    this.acc[4] += amount;
    this.acc[3] += amount * 0.3;
    this.acc[2] = Math.max(0, this.acc[2] - amount * 0.5);
  }

  // ═══════════════════════════════════════════
  // MATH UTILITIES
  // ═══════════════════════════════════════════

  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-Math.max(-10, Math.min(10, x))));
  }

  private softmax(logits: number[]): number[] {
    const maxLogit = Math.max(...Array.from(logits));
    const exps = logits.map(l => Math.exp(l - maxLogit));
    const sum = exps.reduce((s, e) => s + e, 0);
    return exps.map(e => e / sum);
  }

  private clampGrad(g: number): number {
    return Math.max(-1, Math.min(1, g)); // gradient clipping
  }

  // ═══════════════════════════════════════════
  // WEIGHT PERSISTENCE
  // ═══════════════════════════════════════════

  private async loadOrInitWeights(): Promise<void> {
    const result = await this.db.query<AffectWeights>(
      'SELECT * FROM affect_weights ORDER BY step_count DESC LIMIT 1',
    );

    if (result.isOk() && result.value.length > 0) {
      const w = result.value[0];
      this.W1 = w.W1;
      this.W2 = w.W2;
      this.W_mode = w.W_mode;
      this.lr = w.learning_rate;
      this.stepCount = w.step_count;
      this.logger.log(`Loaded affect weights (step ${this.stepCount})`);
    } else {
      this.initWeights();
      this.logger.log('Initialized affect weights (Xavier)');
    }
  }

  /** Xavier initialization: weights ~ Normal(0, sqrt(2 / (fan_in + fan_out))) */
  private initWeights(): void {
    this.W1 = this.xavierInit(N_ACCUMULATORS, N_HORMONES);
    this.W2 = this.xavierInit(N_HORMONES, N_CONFIG_TARGETS);
    this.W_mode = this.xavierInit(N_HORMONES, N_MODES);
    this.lr = 0.01;
    this.stepCount = 0;
  }

  private xavierInit(fanIn: number, fanOut: number): number[][] {
    const scale = Math.sqrt(2 / (fanIn + fanOut));
    return Array.from({ length: fanIn }, () =>
      Array.from({ length: fanOut }, () => (Math.random() * 2 - 1) * scale),
    );
  }

  private async persistWeights(): Promise<void> {
    await this.db.create('affect_weights', {
      W1: this.W1,
      W2: this.W2,
      W_mode: this.W_mode,
      learning_rate: this.lr,
      step_count: this.stepCount,
    } as Record<string, unknown>);
  }
}
