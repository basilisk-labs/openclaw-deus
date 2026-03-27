import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError, ValidationError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { EventsService } from '../events/events.service';
import { CognitiveConfigService } from '../cognitive/cognitive-config.service';
import { MetricsService } from './metrics.service';
import { BenchmarkService } from './benchmark.service';
import { CognitiveSnapshot } from './metrics.types';
import { Hypothesis, ParamChange } from './diagnosis.types';
import { BenchmarkResult, BenchmarkSuiteResult } from './benchmark.types';
import { Experiment, ExperimentVerdict, CognitiveImprovement } from './experiment.types';

const MAX_PARAM_DELTA_RATIO = 0.2; // max 20% change per param

@Injectable()
export class ExperimentService {
  private readonly logger = new Logger(ExperimentService.name);

  constructor(
    private readonly db: SurrealService,
    private readonly events: EventsService,
    private readonly config: CognitiveConfigService,
    private readonly metrics: MetricsService,
    private readonly benchmarks: BenchmarkService,
  ) {}

  /**
   * Run a full experiment for a parameter adjustment hypothesis.
   * checkpoint → mutate → benchmark → compare → commit or rollback
   */
  async runParamExperiment(hypothesis: Hypothesis): Promise<Result<Experiment, DomainError>> {
    if (hypothesis.type !== 'param_adjustment' || !hypothesis.param_changes?.length) {
      return err(new ValidationError('Hypothesis must be param_adjustment with param_changes'));
    }

    // Validate delta limits
    for (const change of hypothesis.param_changes) {
      const current = this.config.get(change.key);
      if (current === 0) continue;
      const deltaRatio = Math.abs(change.to - change.from) / Math.abs(current);
      if (deltaRatio > MAX_PARAM_DELTA_RATIO) {
        return err(new ValidationError(
          `Param ${change.key}: delta ${deltaRatio.toFixed(2)} exceeds max ${MAX_PARAM_DELTA_RATIO}`,
        ));
      }
    }

    const now = new Date().toISOString();

    // Step 1: Checkpoint
    const configSnapshot = this.snapshotConfig();
    const baselineMetrics = await this.metrics.snapshot();
    if (baselineMetrics.isErr()) return err(baselineMetrics.error);

    const baselineBenchmarks = await this.benchmarks.runAll();
    if (baselineBenchmarks.isErr()) return err(baselineBenchmarks.error);

    const experiment: Experiment = {
      hypothesis_id: hypothesis.id,
      type: 'param_adjustment',
      status: 'running',
      config_snapshot: configSnapshot,
      baseline_metrics: baselineMetrics.value,
      baseline_benchmarks: baselineBenchmarks.value.results,
      mutations: hypothesis.param_changes,
      verdict: 'neutral',
      started_at: now,
    };

    await this.events.emit('experiment.started', { hypothesis_id: hypothesis.id });

    // Step 2: Mutate
    for (const change of hypothesis.param_changes) {
      await this.config.set(change.key, change.to, `experiment: ${hypothesis.description}`);
    }

    // Step 3: Re-run benchmarks with new params
    const postBenchmarks = await this.benchmarks.runAll();
    const postMetrics = await this.metrics.snapshot();

    experiment.post_benchmarks = postBenchmarks.isOk() ? postBenchmarks.value.results : [];
    experiment.post_metrics = postMetrics.isOk() ? postMetrics.value : undefined;

    // Step 4: Compare
    const verdict = this.evaluateExperiment(
      baselineBenchmarks.value,
      postBenchmarks.isOk() ? postBenchmarks.value : null,
      baselineMetrics.value,
      postMetrics.isOk() ? postMetrics.value : null,
    );

    experiment.verdict = verdict;
    experiment.improvement = this.computeImprovement(
      baselineMetrics.value,
      postMetrics.isOk() ? postMetrics.value : null,
    );

    // Step 5: Commit or Rollback
    if (verdict === 'regressed') {
      await this.rollback(configSnapshot);
      experiment.status = 'rolled_back';
      await this.events.emit('experiment.rolled_back', {
        hypothesis_id: hypothesis.id,
        reason: 'Benchmark regression detected',
      });
      this.logger.warn(`Experiment ${hypothesis.id}: ROLLED BACK (regressed)`);
    } else {
      experiment.status = 'completed';
      await this.events.emit('experiment.committed', {
        hypothesis_id: hypothesis.id,
        verdict,
        improvement: experiment.improvement,
      });
      this.logger.log(`Experiment ${hypothesis.id}: ${verdict}`);
    }

    experiment.finished_at = new Date().toISOString();
    await this.db.create('experiment', experiment as unknown as Record<string, unknown>);

    return ok(experiment);
  }

  /**
   * Store a logic improvement proposal for operator review.
   */
  async proposeLogicImprovement(hypothesis: Hypothesis): Promise<Result<CognitiveImprovement, DomainError>> {
    const improvement: CognitiveImprovement = {
      hypothesis_id: hypothesis.id,
      type: hypothesis.type as CognitiveImprovement['type'],
      target_service: hypothesis.target_service,
      target_method: hypothesis.target_method,
      description: hypothesis.description,
      logic_proposal: hypothesis.logic_proposal || hypothesis.description,
      code_sketch: hypothesis.code_sketch,
      expected_improvement: hypothesis.expected_improvement,
      status: 'pending',
      created_at: new Date().toISOString(),
    } as CognitiveImprovement;

    const result = await this.db.create('cognitive_improvement', improvement as unknown as Record<string, unknown>);
    if (result.isErr()) return err(result.error);

    await this.events.emit('improvement.proposed', {
      target_service: hypothesis.target_service,
      description: hypothesis.description,
    });

    this.logger.log(`Logic improvement proposed: ${hypothesis.description}`);
    return ok(result.value as unknown as CognitiveImprovement);
  }

  /**
   * Operator approves/rejects a logic improvement.
   */
  async reviewImprovement(
    id: string,
    decision: 'approved' | 'rejected',
    notes?: string,
  ): Promise<Result<CognitiveImprovement, DomainError>> {
    const result = await this.db.update<CognitiveImprovement>(id, {
      status: decision,
      operator_notes: notes,
      reviewed_at: new Date().toISOString(),
    } as unknown as Record<string, unknown>);
    if (result.isErr()) return err(result.error);
    return ok(result.value);
  }

  async getPendingImprovements(): Promise<Result<CognitiveImprovement[], DomainError>> {
    return this.db.query<CognitiveImprovement>(
      "SELECT * FROM cognitive_improvement WHERE status = 'pending' ORDER BY created_at DESC",
    );
  }

  private snapshotConfig(): Record<string, number> {
    const snapshot: Record<string, number> = {};
    for (const param of this.config.getAll()) {
      snapshot[param.key] = param.value;
    }
    return snapshot;
  }

  private async rollback(configSnapshot: Record<string, number>): Promise<void> {
    for (const [key, value] of Object.entries(configSnapshot)) {
      await this.config.set(key, value, 'experiment rollback');
    }
  }

  private evaluateExperiment(
    baselineBench: BenchmarkSuiteResult,
    postBench: BenchmarkSuiteResult | null,
    baselineMetrics: CognitiveSnapshot,
    postMetrics: CognitiveSnapshot | null,
  ): ExperimentVerdict {
    if (!postBench || !postMetrics) return 'regressed';

    // Rule 1: If ANY benchmark that was passing now fails → regressed
    for (const baseline of baselineBench.results) {
      if (baseline.passed) {
        const post = postBench.results.find((r) => r.scenario_id === baseline.scenario_id);
        if (post && !post.passed) {
          return 'regressed';
        }
      }
    }

    // Rule 2: Compare health scores
    const healthDelta = postMetrics.health_score - baselineMetrics.health_score;
    if (healthDelta > 0.02) return 'improved';
    if (healthDelta < -0.02) return 'regressed';

    // Rule 3: More benchmarks passing
    if (postBench.passed > baselineBench.passed) return 'improved';
    if (postBench.passed < baselineBench.passed) return 'regressed';

    return 'neutral';
  }

  private computeImprovement(
    baseline: CognitiveSnapshot,
    post: CognitiveSnapshot | null,
  ): Record<string, number> {
    if (!post) return {};
    return {
      health_score: Math.round((post.health_score - baseline.health_score) * 1000) / 1000,
      coherence: Math.round((post.dimensions.coherence.score - baseline.dimensions.coherence.score) * 1000) / 1000,
      calibration: Math.round((baseline.dimensions.calibration.ece - post.dimensions.calibration.ece) * 1000) / 1000,
      episodes_success: Math.round((post.dimensions.episodes.success_rate - baseline.dimensions.episodes.success_rate) * 1000) / 1000,
    };
  }
}
