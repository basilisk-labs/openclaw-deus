import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SurrealService } from '../database/surreal.service';
import { CognitiveConfigService } from '../cognitive/cognitive-config.service';

/**
 * SensorimotorPredictorService: Learned dynamics model in embedding space.
 *
 * Combines JEPA + Active Inference + Sensorimotor Contingency:
 * - JEPA: predict next position in concept space (not raw observations)
 * - Active Inference: minimize variational free energy (prediction error + uncertainty)
 * - SMC: fundamental unit is (action, position_t, position_t+1)
 *
 * Architecture (following AffectiveStateService pattern):
 *   position_t (N) + action_embedding (A) → delta (N) + uncertainty (N)
 *   position_t+1 = position_t + tanh(W_delta × [pos; action]) × scale
 *   uncertainty = softplus(W_unc × [pos; action])
 *
 * Loss = prediction_error + β × uncertainty_penalty
 * Backward: analytical gradients, clamp, periodic persistence.
 */

const ACTION_EMBED_DIM = 8;
const MAX_POS_DIM = 64; // matches MTREE index dimension
const SCALE = 0.5; // max position delta per step

interface SensorimotorTransition {
  position_t: number[];
  position_t1: number[];
  action: string;
  reward: number;
  cycle: number;
}

interface PredictionResult {
  predicted_position: number[];
  uncertainty: number[];
  confidence: number;
}

@Injectable()
export class SensorimotorPredictorService implements OnModuleInit {
  private readonly logger = new Logger(SensorimotorPredictorService.name);

  // Learned weights
  private W_action!: number[][]; // action_count × ACTION_EMBED_DIM
  private W_delta!: number[][]; // (posDim + ACTION_EMBED_DIM) × posDim
  private W_unc!: number[][]; // (posDim + ACTION_EMBED_DIM) × posDim
  private actionIndex = new Map<string, number>(); // action → index
  private lr = 0.01;
  private stepCount = 0;
  private posDim = 8; // grows with concept space dimensions

  // Cached forward pass values (for backward)
  private lastInput: number[] = [];
  private lastDeltaLogit: number[] = [];
  private lastDelta: number[] = [];
  private lastUncLogit: number[] = [];
  private lastUncertainty: number[] = [];

  // Known actions (built from world)
  private static readonly DEFAULT_ACTIONS = ['touch', 'push', 'drop', 'shake', 'look_closely', 'put_in_water',
    'approach', 'share', 'take', 'observe', 'help'];

  constructor(
    private readonly db: SurrealService,
    private readonly config: CognitiveConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadOrInitWeights();
  }

  // ═══════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════

  /**
   * Predict next position given current position and action.
   * Returns predicted position, per-dimension uncertainty, and overall confidence.
   */
  predict(position: number[], action: string): PredictionResult {
    const padded = this.padPosition(position);
    const { predicted, uncertainty } = this.forward(padded, action);

    // Confidence = inverse of mean uncertainty
    const meanUnc = uncertainty.reduce((s, u) => s + u, 0) / Math.max(1, uncertainty.length);
    const confidence = Math.max(0, Math.min(1, 1 / (1 + meanUnc)));

    return {
      predicted_position: predicted,
      uncertainty,
      confidence,
    };
  }

  /**
   * Record a sensorimotor transition for training.
   * Called after every action→consequence in tryAct().
   */
  async recordTransition(
    position_t: number[], position_t1: number[],
    action: string, reward: number, cycle: number,
  ): Promise<void> {
    await this.db.create('sensorimotor_transition', {
      position_t: this.padPosition(position_t),
      position_t1: this.padPosition(position_t1),
      action, reward, cycle, trained: false,
    } as Record<string, unknown>);
  }

  /**
   * Train on a batch of untrained transitions. Called on SLOW cadence.
   * Returns loss for monitoring.
   */
  async trainOnBatch(batchSize = 10): Promise<{ loss: number; count: number }> {
    const result = await this.db.query<SensorimotorTransition>(
      `SELECT position_t, position_t1, action, reward, cycle
       FROM sensorimotor_transition WHERE trained = false
       ORDER BY cycle DESC LIMIT $limit`,
      { limit: batchSize },
    );

    if (result.isErr() || result.value.length === 0) {
      return { loss: 0, count: 0 };
    }

    const transitions = result.value;
    let totalLoss = 0;

    for (const t of transitions) {
      // Ensure action is in index
      this.ensureAction(t.action);

      // Forward pass
      const padT = this.padPosition(t.position_t);
      const padT1 = this.padPosition(t.position_t1);
      const { predicted } = this.forward(padT, t.action);

      // Compute loss
      const loss = this.computeLoss(predicted, padT1, t.reward);
      totalLoss += loss;

      // Backward pass
      this.backward(padT1, t.reward);
    }

    this.stepCount++;
    const avgLoss = totalLoss / transitions.length;

    // Mark as trained
    await this.db.execute(
      `UPDATE sensorimotor_transition SET trained = true WHERE trained = false ORDER BY cycle DESC LIMIT $limit`,
      { limit: batchSize },
    );

    // Persist weights periodically
    if (this.stepCount % 10 === 0) {
      await this.persistWeights();
    }

    if (transitions.length > 0) {
      this.logger.log(`Predictor trained: ${transitions.length} transitions, loss=${avgLoss.toFixed(4)}, step=${this.stepCount}`);
    }

    return { loss: avgLoss, count: transitions.length };
  }

  /**
   * Get regional uncertainty for a position+action.
   * Used by curiosity drive: high uncertainty → explore.
   */
  getUncertainty(position: number[], action: string): number {
    const { uncertainty } = this.predict(position, action);
    return uncertainty.reduce((s, u) => s + u, 0) / Math.max(1, uncertainty.length);
  }

  // ═══════════════════════════════════════════
  // FORWARD PASS
  // ═══════════════════════════════════════════

  private forward(position: number[], action: string): { predicted: number[]; uncertainty: number[] } {
    this.ensureAction(action);
    const actionIdx = this.actionIndex.get(action) || 0;

    // Action embedding
    const actionVec = this.W_action[actionIdx] || new Array(ACTION_EMBED_DIM).fill(0);

    // Input: concat(position, action_embedding)
    const input = [...position.slice(0, this.posDim), ...actionVec];
    this.lastInput = input;
    const inputDim = this.posDim + ACTION_EMBED_DIM;

    // Delta prediction: tanh(W_delta × input) × scale
    const deltaLogit = new Array(this.posDim).fill(0);
    for (let j = 0; j < this.posDim; j++) {
      let sum = 0;
      for (let i = 0; i < Math.min(inputDim, this.W_delta.length); i++) {
        sum += (this.W_delta[i]?.[j] ?? 0) * (input[i] ?? 0);
      }
      deltaLogit[j] = sum;
    }
    this.lastDeltaLogit = deltaLogit;

    const delta = deltaLogit.map(l => Math.tanh(l) * SCALE);
    this.lastDelta = delta;

    // Predicted next position
    const predicted = position.slice(0, this.posDim).map((p, i) => p + (delta[i] || 0));

    // Uncertainty: softplus(W_unc × input)
    const uncLogit = new Array(this.posDim).fill(0);
    for (let j = 0; j < this.posDim; j++) {
      let sum = 0;
      for (let i = 0; i < Math.min(inputDim, this.W_unc.length); i++) {
        sum += (this.W_unc[i]?.[j] ?? 0) * (input[i] ?? 0);
      }
      uncLogit[j] = sum;
    }
    this.lastUncLogit = uncLogit;
    const uncertainty = uncLogit.map(l => Math.log(1 + Math.exp(l))); // softplus
    this.lastUncertainty = uncertainty;

    return { predicted, uncertainty };
  }

  // ═══════════════════════════════════════════
  // LOSS: VARIATIONAL FREE ENERGY
  // ═══════════════════════════════════════════

  private computeLoss(predicted: number[], actual: number[], reward: number): number {
    const beta = this.config.get('predictor.beta_kl') ?? 0.1;

    // Prediction error: ||actual - predicted||²
    let predError = 0;
    for (let i = 0; i < this.posDim; i++) {
      predError += ((actual[i] || 0) - (predicted[i] || 0)) ** 2;
    }
    predError /= this.posDim;

    // Uncertainty penalty: log(unc) + error²/unc
    // Encourages: low uncertainty when correct, high uncertainty when wrong
    let uncPenalty = 0;
    for (let i = 0; i < this.posDim; i++) {
      const unc = Math.max(0.01, this.lastUncertainty[i] || 0.5);
      const err_i = ((actual[i] || 0) - (predicted[i] || 0)) ** 2;
      uncPenalty += Math.log(unc) + err_i / unc;
    }
    uncPenalty /= this.posDim;

    // Free energy = prediction_error + β × uncertainty_penalty - reward_bonus
    return predError + beta * uncPenalty - reward * 0.1;
  }

  // ═══════════════════════════════════════════
  // BACKWARD PASS (analytical gradients)
  // ═══════════════════════════════════════════

  private backward(actual: number[], reward: number): void {
    const inputDim = this.posDim + ACTION_EMBED_DIM;
    const beta = this.config.get('predictor.beta_kl') ?? 0.1;

    // ∂L/∂predicted = 2(predicted - actual) / posDim
    const dL_dpred = new Array(this.posDim).fill(0);
    for (let i = 0; i < this.posDim; i++) {
      const pred = (this.lastInput[i] || 0) + (this.lastDelta[i] || 0);
      dL_dpred[i] = 2 * (pred - (actual[i] || 0)) / this.posDim;
    }

    // ∂predicted/∂delta = 1
    // ∂delta/∂deltaLogit = (1 - tanh²(logit)) × SCALE
    const dDelta_dLogit = this.lastDeltaLogit.map(l => (1 - Math.tanh(l) ** 2) * SCALE);

    // ∂L/∂W_delta[i][j] = ∂L/∂pred[j] × dDelta_dLogit[j] × input[i]
    for (let i = 0; i < Math.min(inputDim, this.W_delta.length); i++) {
      for (let j = 0; j < this.posDim; j++) {
        const grad = dL_dpred[j] * (dDelta_dLogit[j] || 0) * (this.lastInput[i] || 0);
        this.W_delta[i][j] -= this.lr * this.clamp(grad);
      }
    }

    // ∂L/∂W_unc: gradient of uncertainty penalty
    for (let i = 0; i < Math.min(inputDim, this.W_unc.length); i++) {
      for (let j = 0; j < this.posDim; j++) {
        const unc = Math.max(0.01, this.lastUncertainty[j] || 0.5);
        const err_j = ((actual[j] || 0) - ((this.lastInput[j] || 0) + (this.lastDelta[j] || 0))) ** 2;
        // ∂uncPenalty/∂unc = 1/unc - err²/unc²
        const dPenalty_dUnc = (1 / unc - err_j / (unc * unc)) * beta / this.posDim;
        // ∂softplus/∂logit = sigmoid(logit)
        const sigmoid = 1 / (1 + Math.exp(-(this.lastUncLogit[j] || 0)));
        const grad = dPenalty_dUnc * sigmoid * (this.lastInput[i] || 0);
        this.W_unc[i][j] -= this.lr * this.clamp(grad);
      }
    }

    // ∂L/∂W_action: gradient flows through input → action embedding
    const actionIdx = this.lastActionIdx;
    if (actionIdx >= 0 && actionIdx < this.W_action.length) {
      for (let a = 0; a < ACTION_EMBED_DIM; a++) {
        let grad = 0;
        const inputIdx = this.posDim + a;
        for (let j = 0; j < this.posDim; j++) {
          grad += dL_dpred[j] * (dDelta_dLogit[j] || 0) * (this.W_delta[inputIdx]?.[j] ?? 0);
        }
        this.W_action[actionIdx][a] -= this.lr * this.clamp(grad);
      }
    }
  }

  private lastActionIdx = -1;

  // ═══════════════════════════════════════════
  // WEIGHT MANAGEMENT
  // ═══════════════════════════════════════════

  private async loadOrInitWeights(): Promise<void> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM sensorimotor_weights ORDER BY step_count DESC LIMIT 1',
    );

    if (result.isOk() && result.value.length > 0) {
      const w = result.value[0];
      try {
        this.W_action = JSON.parse(w.W_action as string || '[]');
        this.W_delta = JSON.parse(w.W_delta as string || '[]');
        this.W_unc = JSON.parse(w.W_uncertainty as string || '[]');
        this.actionIndex = new Map(Object.entries(JSON.parse(w.action_index as string || '{}')));
        this.lr = (w.learning_rate as number) || 0.01;
        this.stepCount = (w.step_count as number) || 0;
        this.logger.log(`Predictor weights loaded: step=${this.stepCount}, ${this.actionIndex.size} actions`);
        return;
      } catch { /* fall through to init */ }
    }

    this.initWeights();
  }

  private initWeights(): void {
    // Build action index from default actions
    this.actionIndex = new Map();
    for (let i = 0; i < SensorimotorPredictorService.DEFAULT_ACTIONS.length; i++) {
      this.actionIndex.set(SensorimotorPredictorService.DEFAULT_ACTIONS[i], i);
    }

    const actionCount = SensorimotorPredictorService.DEFAULT_ACTIONS.length;
    const inputDim = this.posDim + ACTION_EMBED_DIM;

    this.W_action = this.xavier(actionCount, ACTION_EMBED_DIM);
    this.W_delta = this.xavier(inputDim, this.posDim);
    this.W_unc = this.xavier(inputDim, this.posDim);
    this.lr = 0.01;
    this.stepCount = 0;

    this.logger.log(`Predictor weights initialized: posDim=${this.posDim}, actions=${actionCount}`);
  }

  private async persistWeights(): Promise<void> {
    try {
      const actionObj: Record<string, number> = {};
      for (const [k, v] of this.actionIndex) actionObj[k] = v;

      await this.db.create('sensorimotor_weights', {
        W_action: JSON.stringify(this.W_action),
        W_delta: JSON.stringify(this.W_delta),
        W_uncertainty: JSON.stringify(this.W_unc),
        action_index: JSON.stringify(actionObj),
        learning_rate: this.lr,
        step_count: this.stepCount,
      } as Record<string, unknown>);
    } catch (e) {
      this.logger.warn(`Failed to persist predictor weights: ${e}`);
    }
  }

  /**
   * Update position dimension when concept space grows.
   * Called when new dimensions are born.
   */
  updatePosDim(newDim: number): void {
    if (newDim <= this.posDim) return;

    const oldDim = this.posDim;
    this.posDim = Math.min(newDim, MAX_POS_DIM);
    const inputDim = this.posDim + ACTION_EMBED_DIM;

    // Expand W_delta and W_unc: add rows and columns
    while (this.W_delta.length < inputDim) {
      this.W_delta.push(new Array(this.posDim).fill(0).map(() => (Math.random() - 0.5) * 0.1));
    }
    for (const row of this.W_delta) {
      while (row.length < this.posDim) row.push((Math.random() - 0.5) * 0.1);
    }

    while (this.W_unc.length < inputDim) {
      this.W_unc.push(new Array(this.posDim).fill(0).map(() => (Math.random() - 0.5) * 0.1));
    }
    for (const row of this.W_unc) {
      while (row.length < this.posDim) row.push((Math.random() - 0.5) * 0.1);
    }

    if (oldDim !== this.posDim) {
      this.logger.log(`Predictor expanded: ${oldDim}D → ${this.posDim}D`);
    }
  }

  // ═══════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════

  private ensureAction(action: string): void {
    if (!this.actionIndex.has(action)) {
      const idx = this.actionIndex.size;
      this.actionIndex.set(action, idx);
      // Expand W_action
      this.W_action.push(new Array(ACTION_EMBED_DIM).fill(0).map(() => (Math.random() - 0.5) * 0.3));
    }
    this.lastActionIdx = this.actionIndex.get(action) || 0;
  }

  private padPosition(pos: number[]): number[] {
    const padded = new Array(this.posDim).fill(0);
    for (let i = 0; i < Math.min(pos.length, this.posDim); i++) {
      padded[i] = pos[i] || 0;
    }
    return padded;
  }

  private xavier(fanIn: number, fanOut: number): number[][] {
    const scale = Math.sqrt(2 / (fanIn + fanOut));
    return Array.from({ length: fanIn }, () =>
      Array.from({ length: fanOut }, () => (Math.random() * 2 - 1) * scale),
    );
  }

  private clamp(grad: number): number {
    return Math.max(-1, Math.min(1, grad));
  }

  getStepCount(): number { return this.stepCount; }
}
