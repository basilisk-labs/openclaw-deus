import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../../common/types/result.types';
import { SurrealService } from '../../database/surreal.service';
import { CommitDelta, CommitType, Signal, TimeSense } from '../kernel.types';
import { TraceGraphService } from '../memory/trace-graph.service';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';

/**
 * CommitKernel: The attention bottleneck.
 *
 * Does NOT see raw events. Receives only:
 * - Convergent signals (2+ agents agree on same traces)
 * - Escalations (single agent urgency > threshold)
 *
 * Each commit atomically updates the world state and is logged immutably.
 * Commits are what the system "notices" — everything else is unconscious.
 */
@Injectable()
export class CommitKernelService {
  private readonly logger = new Logger(CommitKernelService.name);
  private commitCount = 0;

  constructor(
    private readonly db: SurrealService,
    private readonly traceGraph: TraceGraphService,
    private readonly config: CognitiveConfigService,
  ) {}

  /**
   * Process signals from one kernel cycle.
   * Detect convergence → create commit deltas → apply.
   * Returns commits made (0 if no convergence = system is stable).
   */
  async processCycle(signals: Signal[]): Promise<Result<CommitDelta[], DomainError>> {
    const cycle = this.traceGraph.getCycle();
    const commits: CommitDelta[] = [];

    // 1. Ingest signals into trace graph (spreading activation happens here)
    const activated = await this.traceGraph.ingestSignals(signals);
    if (activated.isErr()) return err(activated.error);

    // 2. Find convergent clusters
    const clusters = await this.traceGraph.findConvergentClusters(signals);

    // 3. Check for escalations (single agent, high urgency)
    const escThreshold = this.config.get('kernel.escalation_threshold');
    const escalations = signals.filter(s => s.confidence > escThreshold);

    this.logger.log(`ProcessCycle: ${signals.length} signals, ${clusters.length} clusters, ${escalations.length} escalations (threshold=${escThreshold})`);
    for (const s of signals.slice(0, 5)) {
      this.logger.log(`  Signal: ${s.agent_id} conf=${s.confidence} targets=[${s.targets.slice(0, 2).join(',')}] "${s.content.slice(0, 60)}"`);
    }

    // 4. Create commits from convergent clusters
    for (const cluster of clusters) {
      const commit = this.buildCommit(cluster, signals, cycle, false);
      const applied = await this.applyCommit(commit);
      if (applied.isOk()) commits.push(commit);
    }

    // 5. Create commits from escalations (if not already covered)
    for (const esc of escalations) {
      const alreadyCovered = commits.some(c => c.source_agents.includes(esc.agent_id));
      if (!alreadyCovered) {
        const commit = this.buildEscalationCommit(esc, cycle);
        const applied = await this.applyCommit(commit);
        if (applied.isOk()) commits.push(commit);
      }
    }

    return ok(commits);
  }

  /**
   * Apply a commit: persist to immutable log, update trace states.
   */
  private async applyCommit(commit: CommitDelta): Promise<Result<void, DomainError>> {
    // Persist to immutable commit log (all numbers safe from NaN/undefined)
    const result = await this.db.create('commit_log', {
      commit_id: commit.commit_id,
      cycle: commit.cycle || 0,
      type: commit.type || 'perceptual',
      source_agents: commit.source_agents || [],
      convergence_score: Number(commit.convergence_score) || 0,
      is_escalation: commit.is_escalation || false,
      novelty_cost: Number(commit.novelty_cost) || 0,
      prediction_error: Number(commit.prediction_error) || 0,
      maturity: Number(commit.maturity) || 0,
      urgency: Number(commit.urgency) || 0,
      energy: Number(commit.energy) || 0,
      changes: commit.changes || {},
    } as Record<string, unknown>);

    if (result.isErr()) {
      this.logger.warn(`Commit failed: ${result.error.message}`);
      return err(result.error);
    }

    this.commitCount++;
    this.logger.log(
      `Commit #${this.commitCount} [cycle=${commit.cycle}]: ` +
      `convergence=${commit.convergence_score.toFixed(2)}, ` +
      `agents=[${commit.source_agents.join(',')}], ` +
      `novelty=${commit.novelty_cost.toFixed(2)}`,
    );

    return ok(undefined);
  }

  /**
   * Get recent commits (attention window = working memory).
   */
  async getAttentionWindow(): Promise<Result<CommitDelta[], DomainError>> {
    const window = this.config.get('kernel.attention_window');
    return this.db.query<CommitDelta>(
      `SELECT * FROM commit_log ORDER BY cycle DESC LIMIT $limit`,
      { limit: window },
    );
  }

  /**
   * Compute TimeSense from commit history (purely derived, never stored).
   */
  async computeTimeSense(): Promise<TimeSense> {
    const cycle = this.traceGraph.getCycle();

    // Get recent commits for analysis
    const recentResult = await this.db.query<CommitDelta>(
      `SELECT * FROM commit_log ORDER BY cycle DESC LIMIT 50`,
    );
    const recent = recentResult.isOk() ? recentResult.value : [];

    // Tempo: commits in last 10 cycles
    const windowSize = 10;
    const recentWindow = recent.filter(c => c.cycle > cycle - windowSize);
    const tempo = recentWindow.length / Math.max(1, windowSize);

    // Novelty rate: average novelty cost of recent commits
    const noveltyRate = recent.length > 0
      ? recent.slice(0, 20).reduce((s, c) => s + (c.novelty_cost || 0), 0) / Math.min(20, recent.length)
      : 0;

    // Prediction error rate
    const predErrors = recent.filter(c => c.prediction_error !== undefined && c.prediction_error !== null);
    const predErrorRate = predErrors.length > 0
      ? predErrors.slice(0, 20).reduce((s, c) => s + (c.prediction_error || 0), 0) / Math.min(20, predErrors.length)
      : 0;

    // Trace decay velocity: how fast are active traces losing weight
    const activeTraces = await this.traceGraph.getActiveTraces(20);
    const traceDecayVelocity = activeTraces.isOk() && activeTraces.value.length > 0
      ? 1 - (activeTraces.value.reduce((s, t) => s + t.freshness, 0) / activeTraces.value.length)
      : 0;

    // TIME = local rate of reconfiguration under limited commit bandwidth
    // Not just density — cost of restructuring through bottleneck
    const commitBandwidth = this.config.get('kernel.attention_window') || 20;
    const reconfigCost = recent.slice(0, 20).reduce((s, c) => {
      const movementCost = (c.changes?.traces_activated?.length || 0) * 0.1;
      const dimBirthCost = (c.changes as Record<string, unknown>)?.new_dimensions ? 0.5 : 0;
      return s + (c.novelty_cost || 0) + movementCost + dimBirthCost;
    }, 0) / Math.max(1, commitBandwidth);

    const wNov = this.config.get('kernel.dilation_novelty_w');
    const wPred = this.config.get('kernel.dilation_pred_error_w');
    const wTempo = this.config.get('kernel.dilation_tempo_w');
    const dilation = reconfigCost * wNov + predErrorRate * wPred + noveltyRate * 0.3 - (1 - tempo) * wTempo;

    // Rhythm phase: based on recent commit density pattern
    const phase: TimeSense['rhythm_phase'] = tempo > 0.5 ? 'active'
      : tempo > 0.1 ? 'consolidating'
      : 'resting';

    return {
      cycle,
      tempo: Math.round(tempo * 100) / 100,
      novelty_rate: Math.round(noveltyRate * 1000) / 1000,
      prediction_error_rate: Math.round(predErrorRate * 1000) / 1000,
      trace_decay_velocity: Math.round(traceDecayVelocity * 1000) / 1000,
      dilation: Math.round(Math.max(0.1, Math.min(3.0, dilation)) * 100) / 100,
      rhythm_phase: phase,
    };
  }

  getCommitCount(): number { return this.commitCount; }

  /**
   * Determine commit type from the dominant signal types.
   */
  private inferCommitType(signals: Signal[]): CommitType {
    const typeCounts: Record<string, number> = {};
    for (const s of signals) {
      typeCounts[s.type] = (typeCounts[s.type] || 0) + s.confidence;
    }

    const dominant = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];
    if (!dominant) return 'perceptual';

    switch (dominant[0]) {
      case 'perception': return 'perceptual';
      case 'prediction': return 'interpretive';
      case 'affect': return 'priority';
      case 'strategy': return signals.some(s => s.type === 'affect') ? 'self_model' : 'action';
      case 'priority': return 'priority';
      default: return 'meta';
    }
  }

  private computeEnergy(novelty: number, predError: number, urgency: number): number {
    const n = Number(novelty) || 0;
    const p = Number(predError) || 0;
    const u = Number(urgency) || 0;
    const wN = this.config.get('kernel.energy_w_novelty') || 0.4;
    const wP = this.config.get('kernel.energy_w_pred_error') || 0.3;
    const wU = this.config.get('kernel.energy_w_urgency') || 0.3;
    return Math.round((n * wN + p * wP + u * wU) * 1000) / 1000;
  }

  private buildCommit(
    cluster: { traces: string[]; agents: string[]; convergence: number; avg_urgency: number },
    signals: Signal[],
    cycle: number,
    isEscalation: boolean,
  ): CommitDelta {
    const relevantSignals = signals.filter(s => cluster.agents.includes(s.agent_id));
    const novelty = relevantSignals.reduce((s, sig) => s + sig.novelty_cost, 0) / Math.max(1, relevantSignals.length);
    const predSignal = relevantSignals.find(s => s.type === 'prediction');
    const predError = predSignal?.payload?.prediction_error as number ?? 0;

    return {
      commit_id: `C${cycle}_${this.commitCount}_${Date.now()}`,
      cycle,
      type: this.inferCommitType(relevantSignals),
      source_agents: cluster.agents,
      convergence_score: cluster.convergence,
      is_escalation: isEscalation,
      changes: {
        traces_activated: cluster.traces,
        traces_suppressed: [],
        traces_created: [],
      },
      novelty_cost: novelty,
      prediction_error: predError,
      maturity: cluster.convergence,
      urgency: cluster.avg_urgency,
      energy: this.computeEnergy(novelty, predError, cluster.avg_urgency),
    };
  }

  private buildEscalationCommit(signal: Signal, cycle: number): CommitDelta {
    return {
      commit_id: `C${cycle}_ESC_${this.commitCount}_${Date.now()}`,
      cycle,
      type: signal.type === 'affect' ? 'priority' : signal.type === 'strategy' ? 'action' : 'perceptual',
      source_agents: [signal.agent_id],
      convergence_score: 0,
      is_escalation: true,
      changes: {
        traces_activated: signal.targets,
        traces_suppressed: [],
        traces_created: [],
      },
      novelty_cost: signal.novelty_cost,
      prediction_error: signal.payload?.prediction_error as number ?? 0,
      maturity: signal.confidence,
      urgency: signal.confidence,
      energy: this.computeEnergy(signal.novelty_cost, signal.payload?.prediction_error as number ?? 0, signal.confidence),
    };
  }
}
