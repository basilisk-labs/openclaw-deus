import { Injectable, Logger } from '@nestjs/common';

/**
 * EnergyService: Cognitive energy budget.
 *
 * Everything costs energy. Without energy constraint there's no trade-off
 * and no reason to optimize behavior.
 *
 * Energy creates the fundamental pressure:
 * - Exploration costs MORE than exploitation → prefer known when tired
 * - LLM calls are expensive → use them wisely
 * - Pain drains energy faster → avoid painful states
 * - Reward partially restores → seek rewarding states
 * - Sleep fully recovers + triggers consolidation
 *
 * Without this, reward/pain are free and the system has no reason
 * to learn efficient strategies.
 */

export interface EnergyState {
  current: number;           // 0-1, current energy level
  max: number;               // max energy (can grow with "fitness")
  drain_rate: number;        // base energy drain per cycle
  recovery_rate: number;     // energy recovered per rest cycle
  fatigue_level: number;     // accumulated fatigue (0-1, resets on sleep)
  cycles_since_sleep: number;
  total_energy_spent: number;
}

@Injectable()
export class EnergyService {
  private readonly logger = new Logger(EnergyService.name);

  private energy = 1.0;
  private maxEnergy = 1.0;
  private fatigue = 0;
  private cyclesSinceSleep = 0;
  private totalSpent = 0;

  /**
   * Spend energy on a cognitive operation. Returns false if insufficient.
   */
  spend(amount: number, reason: string): boolean {
    if (this.energy < amount) {
      return false; // can't afford this operation
    }
    this.energy -= amount;
    this.totalSpent += amount;
    this.fatigue += amount * 0.3; // fatigue accumulates at 30% of spend
    return true;
  }

  /**
   * Cost table for cognitive operations.
   */
  cost = {
    llm_call: 0.08,          // expensive
    trace_create: 0.005,      // cheap
    trace_deep: 0.02,         // attended trace (more processing)
    exploration_action: 0.03, // exploring unknown
    exploitation_action: 0.01,// using known
    reflection_cycle: 0.01,   // idle thinking
    commit: 0.005,            // committing to awareness
    dimension_birth: 0.05,    // creating new concept dimension
  };

  /**
   * Process one cycle: drain base energy, update fatigue.
   * Called every kernel tick.
   */
  tick(): void {
    this.cyclesSinceSleep++;

    // Base drain increases with fatigue
    const drain = 0.002 * (1 + this.fatigue);
    this.energy = Math.max(0, this.energy - drain);

    // Fatigue slowly accumulates even without spending
    this.fatigue = Math.min(1, this.fatigue + 0.001);
  }

  /**
   * Reward partially restores energy — positive experiences are energizing.
   */
  reward(amount: number): void {
    const recovery = amount * 0.2; // 20% of reward becomes energy
    this.energy = Math.min(this.maxEnergy, this.energy + recovery);
    this.fatigue = Math.max(0, this.fatigue - amount * 0.1); // slight fatigue reduction
  }

  /**
   * Pain drains extra energy — stress is exhausting.
   */
  pain(amount: number): void {
    this.energy = Math.max(0, this.energy - amount * 0.15);
    this.fatigue = Math.min(1, this.fatigue + amount * 0.2);
  }

  /**
   * Sleep: full energy recovery + fatigue reset.
   * Triggers consolidation (caller should run nightly-like processing).
   */
  sleep(): { slept: boolean; cycles_awake: number } {
    const cyclesAwake = this.cyclesSinceSleep;
    this.energy = this.maxEnergy;
    this.fatigue = 0;
    this.cyclesSinceSleep = 0;

    // Fitness: max energy grows slightly with use (brain gets more efficient)
    this.maxEnergy = Math.min(1.5, this.maxEnergy + 0.001);

    this.logger.log(`Sleep: recovered to ${this.energy.toFixed(2)}, was awake ${cyclesAwake} cycles`);
    return { slept: true, cycles_awake: cyclesAwake };
  }

  /**
   * Should the system sleep? Driven by energy + fatigue.
   */
  needsSleep(): boolean {
    return this.energy < 0.1 || this.fatigue > 0.8;
  }

  /**
   * Can the system afford an LLM call?
   */
  canAffordLlm(): boolean {
    return this.energy >= this.cost.llm_call;
  }

  /**
   * Can the system afford exploration (more expensive than exploitation)?
   */
  canAffordExploration(): boolean {
    return this.energy >= this.cost.exploration_action;
  }

  /**
   * Get current state for monitoring.
   */
  getState(): EnergyState {
    return {
      current: Math.round(this.energy * 1000) / 1000,
      max: Math.round(this.maxEnergy * 1000) / 1000,
      drain_rate: 0.002 * (1 + this.fatigue),
      recovery_rate: 0.2,
      fatigue_level: Math.round(this.fatigue * 1000) / 1000,
      cycles_since_sleep: this.cyclesSinceSleep,
      total_energy_spent: Math.round(this.totalSpent * 1000) / 1000,
    };
  }

  /**
   * Attention narrowing factor: low energy → narrower attention.
   * Returns 0-1: multiply with attention spread.
   */
  attentionFactor(): number {
    return Math.max(0.2, this.energy); // at 20% energy → 20% attention breadth
  }

  /**
   * Forgetting acceleration: low energy → faster forgetting (drop non-essential).
   * Returns multiplier for forgetting rate.
   */
  forgettingMultiplier(): number {
    return 1 + (1 - this.energy) * 2; // at 0 energy → 3x faster forgetting
  }
}
