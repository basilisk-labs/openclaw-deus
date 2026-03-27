import { Injectable, Logger } from '@nestjs/common';

/**
 * LightConeService: Multi-frequency cognitive processing.
 *
 * Like physics: information propagates at finite speed.
 * Not everything needs full DB scan every tick.
 *
 * Frequency layers:
 *   FAST (~1ms):   in-memory trace dynamics, affect accumulators, energy
 *   MEDIUM (~100ms): spreading activation on cached neighbors
 *   SLOW (~1s):    DB sync (batch write accumulated changes)
 *   GLOBAL (~10s): convergence detection, clustering, dimension naming
 *   DEEP (~60s):   narrative compaction, world model rebuild, meta-learning
 *
 * Each layer has its own cadence. Fast layer never blocks.
 * Slow/global/deep run ASYNC — results arrive when ready.
 */

export type LayerFrequency = 'fast' | 'medium' | 'slow' | 'global' | 'deep';

interface PendingWrite {
  table: string;
  operation: 'create' | 'update' | 'execute';
  data: Record<string, unknown>;
  sql?: string;
  vars?: Record<string, unknown>;
}

@Injectable()
export class LightConeService {
  private readonly logger = new Logger(LightConeService.name);

  // In-memory hot state (FAST layer — no DB)
  private hotTraces = new Map<string, HotTrace>();
  private hotEdgeUpdates: Array<{ from: string; to: string; deltaWeight: number }> = [];
  private pendingWrites: PendingWrite[] = [];

  // Cadence counters
  private tickCounter = 0;
  private lastMediumTick = 0;
  private lastSlowTick = 0;
  private lastGlobalTick = 0;
  private lastDeepTick = 0;

  // Cadence intervals (in ticks)
  readonly cadence = {
    medium: 5,     // every 5 fast ticks
    slow: 50,      // every 50 fast ticks (~DB sync)
    global: 200,   // every 200 fast ticks (~convergence, clusters)
    deep: 1000,    // every 1000 fast ticks (~narrative, world model)
  };

  /**
   * Fast tick: in-memory only. NEVER touches DB. ~0.01ms.
   */
  fastTick(): { shouldMedium: boolean; shouldSlow: boolean; shouldGlobal: boolean; shouldDeep: boolean } {
    this.tickCounter++;

    // Decay hot traces in memory
    for (const [id, trace] of this.hotTraces) {
      trace.weight *= 0.999; // micro-decay
      trace.freshness *= 0.9999;
      if (trace.weight < 0.01) this.hotTraces.delete(id);
    }

    return {
      shouldMedium: this.tickCounter - this.lastMediumTick >= this.cadence.medium,
      shouldSlow: this.tickCounter - this.lastSlowTick >= this.cadence.slow,
      shouldGlobal: this.tickCounter - this.lastGlobalTick >= this.cadence.global,
      shouldDeep: this.tickCounter - this.lastDeepTick >= this.cadence.deep,
    };
  }

  /**
   * Mark medium layer as executed.
   */
  markMedium(): void { this.lastMediumTick = this.tickCounter; }
  markSlow(): void { this.lastSlowTick = this.tickCounter; }
  markGlobal(): void { this.lastGlobalTick = this.tickCounter; }
  markDeep(): void { this.lastDeepTick = this.tickCounter; }

  /**
   * Activate a trace in hot memory (FAST — no DB).
   */
  activateHot(traceId: string, content: string, weight: number, emotionalCharge = 0): void {
    const existing = this.hotTraces.get(traceId);
    if (existing) {
      existing.weight = Math.min(1, existing.weight + 0.1 * (1 - existing.weight));
      existing.freshness = 1.0;
      existing.activationCount++;
    } else {
      this.hotTraces.set(traceId, {
        traceId, content, weight, freshness: 1.0,
        emotionalCharge, activationCount: 1,
      });
    }
  }

  /**
   * Spread activation in hot memory (MEDIUM — cached neighbors only).
   * Returns activated neighbor IDs.
   */
  spreadHot(sourceId: string, neighbors: Array<{ traceId: string; edgeWeight: number }>): string[] {
    const source = this.hotTraces.get(sourceId);
    if (!source || source.weight < 0.1) return [];

    const activated: string[] = [];
    for (const n of neighbors) {
      const boost = n.edgeWeight * 0.3 * source.weight;
      if (boost > 0.01) {
        const existing = this.hotTraces.get(n.traceId);
        if (existing) {
          existing.weight = Math.min(1, existing.weight + boost);
          activated.push(n.traceId);
        }
        // Queue Hebbian edge update for batch DB write
        this.hotEdgeUpdates.push({ from: sourceId, to: n.traceId, deltaWeight: boost * 0.05 });
      }
    }
    return activated;
  }

  /**
   * Queue a DB write for the SLOW layer (batched).
   */
  queueWrite(write: PendingWrite): void {
    this.pendingWrites.push(write);
  }

  /**
   * Flush pending writes to DB (SLOW layer). Returns count.
   */
  flushWrites(): { writes: PendingWrite[]; edgeUpdates: Array<{ from: string; to: string; deltaWeight: number }> } {
    const writes = [...this.pendingWrites];
    const edges = [...this.hotEdgeUpdates];
    this.pendingWrites = [];
    this.hotEdgeUpdates = [];
    return { writes, edgeUpdates: edges };
  }

  /**
   * Get hot traces (for fast-layer agents — no DB needed).
   */
  getHotTraces(limit = 10): HotTrace[] {
    return Array.from(this.hotTraces.values())
      .sort((a, b) => b.weight * b.freshness - a.weight * a.freshness)
      .slice(0, limit);
  }

  getHotTraceCount(): number { return this.hotTraces.size; }

  /**
   * Sync hot state FROM DB (called on SLOW cadence).
   * Loads recently changed traces into hot memory.
   */
  loadFromDb(traces: Array<{ traceId: string; content: string; weight: number; emotionalCharge: number }>): void {
    for (const t of traces) {
      if (!this.hotTraces.has(t.traceId)) {
        this.hotTraces.set(t.traceId, {
          traceId: t.traceId, content: t.content,
          weight: t.weight, freshness: 1.0,
          emotionalCharge: t.emotionalCharge, activationCount: 0,
        });
      }
    }
    // Cap hot memory
    if (this.hotTraces.size > 200) {
      const sorted = Array.from(this.hotTraces.entries())
        .sort((a, b) => a[1].weight - b[1].weight);
      for (let i = 0; i < sorted.length - 200; i++) {
        this.hotTraces.delete(sorted[i][0]);
      }
    }
  }

  getTick(): number { return this.tickCounter; }
}

interface HotTrace {
  traceId: string;
  content: string;
  weight: number;
  freshness: number;
  emotionalCharge: number;
  activationCount: number;
}
