import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { IntrospectionService } from '../introspection/introspection.service';
import { CalibrationService } from '../cognitive/calibration.service';
import { WorldModelService } from '../world-model/world-model.service';
import { CognitiveConfigService } from '../cognitive/cognitive-config.service';
import { LlmBudgetService } from '../llm/llm-budget.service';
import {
  CognitiveSnapshot,
  CognitiveDimensions,
  DimensionName,
  DIMENSION_WEIGHTS,
  DIMENSION_THRESHOLDS,
} from './metrics.types';

/**
 * Single SurrealQL query to gather all metrics data in one DB round-trip.
 */
const METRICS_QUERY = `
  LET $beliefs_all = (SELECT count() AS c FROM belief GROUP ALL);
  LET $beliefs_active = (SELECT count() AS c, math::mean(confidence) AS avg FROM belief WHERE status = 'active' GROUP ALL);
  LET $beliefs_decayed = (SELECT count() AS c FROM belief WHERE confidence < 0.3 AND status = 'active' GROUP ALL);
  LET $beliefs_promoted = (SELECT count() AS c FROM review_candidate WHERE decision = 'promote' AND created_at > time::now() - 7d GROUP ALL);
  LET $knowledge = (SELECT count() AS c FROM knowledge WHERE status = 'active' GROUP ALL);
  LET $gaps_open = (SELECT count() AS c FROM knowledge_gap WHERE status = 'open' GROUP ALL);
  LET $gaps_high = (SELECT count() AS c FROM knowledge_gap WHERE status = 'open' AND impact >= 0.7 GROUP ALL);
  LET $intentions_active = (SELECT count() AS c FROM intention WHERE status IN ['recognized', 'adopted', 'active'] GROUP ALL);
  LET $intentions_completed = (SELECT count() AS c FROM intention WHERE status = 'completed' GROUP ALL);
  LET $intentions_total = (SELECT count() AS c FROM intention GROUP ALL);
  LET $intentions_stale = (SELECT count() AS c FROM intention WHERE status IN ['recognized', 'adopted'] AND updated_at < time::now() - 3d GROUP ALL);
  LET $deliberations = (SELECT count() AS c FROM deliberation GROUP ALL);
  LET $delib_safe = (SELECT count() AS c FROM deliberation WHERE safety_check.passed = true GROUP ALL);
  LET $episodes = (SELECT count() AS c FROM episode GROUP ALL);
  LET $ep_success = (SELECT count() AS c FROM episode WHERE outcome IN ['success', 'partial_success'] GROUP ALL);
  LET $pipeline_runs = (SELECT math::mean(duration_ms) AS avg_ms, count() AS c FROM nightly_run WHERE started_at > time::now() - 7d GROUP ALL);
  LET $pipeline_errors = 0;
  LET $wm = (SELECT confidence, generated_at FROM world_model ORDER BY generated_at DESC LIMIT 1);
  LET $knowledge_recent = (SELECT count() AS c FROM knowledge WHERE created_at > time::now() - 1d GROUP ALL);
  LET $contradictions = (SELECT count() AS c FROM contradicts GROUP ALL);
  RETURN {
    beliefs_all: $beliefs_all[0].c OR 0,
    beliefs_active: $beliefs_active[0].c OR 0,
    beliefs_avg_conf: $beliefs_active[0].avg OR 0,
    beliefs_decayed: $beliefs_decayed[0].c OR 0,
    beliefs_promoted: $beliefs_promoted[0].c OR 0,
    knowledge_total: $knowledge[0].c OR 0,
    knowledge_recent: $knowledge_recent[0].c OR 0,
    gaps_open: $gaps_open[0].c OR 0,
    gaps_high: $gaps_high[0].c OR 0,
    intentions_active: $intentions_active[0].c OR 0,
    intentions_completed: $intentions_completed[0].c OR 0,
    intentions_total: $intentions_total[0].c OR 0,
    intentions_stale: $intentions_stale[0].c OR 0,
    deliberations_total: $deliberations[0].c OR 0,
    deliberations_safe: $delib_safe[0].c OR 0,
    episodes_total: $episodes[0].c OR 0,
    episodes_success: $ep_success[0].c OR 0,
    pipeline_avg_ms: $pipeline_runs[0].avg_ms OR 0,
    pipeline_count: $pipeline_runs[0].c OR 0,
    pipeline_errors: $pipeline_errors OR 0,
    wm_confidence: $wm[0].confidence OR 0,
    wm_generated_at: $wm[0].generated_at OR NONE,
    contradictions: $contradictions[0].c OR 0
  }
`;

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(
    private readonly db: SurrealService,
    private readonly introspection: IntrospectionService,
    private readonly calibration: CalibrationService,
    private readonly worldModel: WorldModelService,
    private readonly config: CognitiveConfigService,
    private readonly budget: LlmBudgetService,
  ) {}

  async snapshot(): Promise<Result<CognitiveSnapshot, DomainError>> {
    const now = new Date();

    // Parallel: DB metrics + calibration
    const [dbResult, calResult] = await Promise.all([
      this.db.queryRaw<any>(METRICS_QUERY),
      this.calibration.computeCalibration(),
    ]);

    const d = dbResult.isOk()
      ? (Array.isArray(dbResult.value) ? dbResult.value[dbResult.value.length - 1] : dbResult.value)
      : {} as Record<string, unknown>;

    const cal = calResult.isOk() ? calResult.value : { ece: 0, overconfident: false, sample_size: 0 };

    // LLM usage
    const usage = this.budget.getUsage();
    const dailyLimit = 500_000; // from DEFAULT_TOKEN_BUDGET
    const cacheHitRate = usage.cache_read_tokens > 0
      ? usage.cache_read_tokens / (usage.input_tokens + usage.cache_read_tokens || 1)
      : 0;

    // World model freshness
    const wmGeneratedAt = d?.wm_generated_at;
    const wmFreshnessHours = wmGeneratedAt
      ? (now.getTime() - new Date(wmGeneratedAt).getTime()) / 3600000
      : 999;

    // Episode trend
    const episodesTotal = d?.episodes_total || 0;
    const episodesSuccess = d?.episodes_success || 0;
    const successRate = episodesTotal > 0 ? episodesSuccess / episodesTotal : 0.5;

    // Intention completion rate
    const intTotal = d?.intentions_total || 0;
    const intCompleted = d?.intentions_completed || 0;
    const completionRate = intTotal > 0 ? intCompleted / intTotal : 0;

    // Deliberation safety
    const delibTotal = d?.deliberations_total || 0;
    const delibSafe = d?.deliberations_safe || 0;
    const safetyRate = delibTotal > 0 ? delibSafe / delibTotal : 1;

    // Pipeline metrics
    const pipelineCount = d?.pipeline_count || 0;
    const pipelineErrors = d?.pipeline_errors || 0;
    const errorRate = pipelineCount > 0 ? pipelineErrors / pipelineCount : 0;

    // Knowledge extraction rate (last 24h)
    const knowledgeRecent = d?.knowledge_recent || 0;

    // Introspection coherence (use latest report instead of running full introspection)
    const latestReport = await this.introspection.getLatestReport();
    const coherence = latestReport.isOk() && latestReport.value
      ? { score: latestReport.value.coherence_score, posture: latestReport.value.posture, contradictions: d?.contradictions || 0 }
      : { score: 0.5, posture: 'unknown', contradictions: d?.contradictions || 0 };

    const dimensions: CognitiveDimensions = {
      coherence,
      calibration: {
        ece: cal.ece,
        overconfident: cal.overconfident,
        sample_size: cal.sample_size,
      },
      knowledge: {
        total: d?.knowledge_total || 0,
        gaps_open: d?.gaps_open || 0,
        gaps_high_impact: d?.gaps_high || 0,
        extraction_rate: knowledgeRecent,
      },
      beliefs: {
        total: d?.beliefs_all || 0,
        active: d?.beliefs_active || 0,
        avg_confidence: Math.round((d?.beliefs_avg_conf || 0) * 1000) / 1000,
        decay_rate: d?.beliefs_decayed || 0,
        promotion_rate: d?.beliefs_promoted || 0,
      },
      intentions: {
        active: d?.intentions_active || 0,
        completion_rate: Math.round(completionRate * 1000) / 1000,
        stale_count: d?.intentions_stale || 0,
        avg_duration_ms: 0, // computed from episodes when available
      },
      deliberation: {
        total: delibTotal,
        safety_pass_rate: Math.round(safetyRate * 1000) / 1000,
        avg_options: 0, // would need per-deliberation data
      },
      episodes: {
        total: episodesTotal,
        success_rate: Math.round(successRate * 1000) / 1000,
        trend: successRate > 0.7 ? 'improving' : successRate > 0.4 ? 'stable' : 'declining',
      },
      pipeline: {
        avg_duration_ms: Math.round(d?.pipeline_avg_ms || 0),
        error_rate: Math.round(errorRate * 1000) / 1000,
        throughput: pipelineCount,
      },
      world_model: {
        confidence: d?.wm_confidence || 0,
        freshness_hours: Math.round(wmFreshnessHours * 10) / 10,
      },
      llm: {
        daily_tokens_used: usage.input_tokens + usage.output_tokens,
        budget_utilization: Math.round(((usage.input_tokens + usage.output_tokens) / dailyLimit) * 1000) / 1000,
        cache_hit_rate: Math.round(cacheHitRate * 1000) / 1000,
      },
    };

    const healthScore = this.computeHealthScore(dimensions);
    const weakDimensions = this.findWeakDimensions(dimensions);

    const snapshot: CognitiveSnapshot = {
      timestamp: now.toISOString(),
      dimensions,
      health_score: healthScore,
      weak_dimensions: weakDimensions,
    };

    // Persist
    await this.db.create('cognitive_snapshot', snapshot as unknown as Record<string, unknown>);

    this.logger.log(`Snapshot: health=${healthScore}, weak=[${weakDimensions.join(',')}]`);
    return ok(snapshot);
  }

  async getLatest(): Promise<Result<CognitiveSnapshot | null, DomainError>> {
    const result = await this.db.query<CognitiveSnapshot>(
      'SELECT * FROM cognitive_snapshot ORDER BY timestamp DESC LIMIT 1',
    );
    if (result.isErr()) return err(result.error);
    return ok(result.value[0] || null);
  }

  async getHistory(limit = 10): Promise<Result<CognitiveSnapshot[], DomainError>> {
    return this.db.query<CognitiveSnapshot>(
      `SELECT * FROM cognitive_snapshot ORDER BY timestamp DESC LIMIT ${limit}`,
    );
  }

  computeHealthScore(dims: CognitiveDimensions): number {
    let score = 0;
    score += this.normalizeDimension('coherence', dims.coherence.score) * DIMENSION_WEIGHTS.coherence;
    score += this.normalizeDimension('calibration', 1 - dims.calibration.ece) * DIMENSION_WEIGHTS.calibration;
    score += this.normalizeDimension('knowledge', dims.knowledge.total > 0 ? Math.min(1, dims.knowledge.total / 50) : 0) * DIMENSION_WEIGHTS.knowledge;
    score += this.normalizeDimension('beliefs', dims.beliefs.avg_confidence) * DIMENSION_WEIGHTS.beliefs;
    score += this.normalizeDimension('intentions', dims.intentions.completion_rate) * DIMENSION_WEIGHTS.intentions;
    score += this.normalizeDimension('deliberation', dims.deliberation.safety_pass_rate) * DIMENSION_WEIGHTS.deliberation;
    score += this.normalizeDimension('episodes', dims.episodes.success_rate) * DIMENSION_WEIGHTS.episodes;
    score += this.normalizeDimension('pipeline', 1 - dims.pipeline.error_rate) * DIMENSION_WEIGHTS.pipeline;
    score += this.normalizeDimension('world_model', dims.world_model.confidence) * DIMENSION_WEIGHTS.world_model;
    score += this.normalizeDimension('llm', 1 - dims.llm.budget_utilization) * DIMENSION_WEIGHTS.llm;
    return Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));
  }

  findWeakDimensions(dims: CognitiveDimensions): string[] {
    const weak: string[] = [];
    const scores: Record<string, number> = {
      coherence: dims.coherence.score,
      calibration: 1 - dims.calibration.ece,
      knowledge: dims.knowledge.total > 0 ? Math.min(1, dims.knowledge.total / 50) : 0,
      beliefs: dims.beliefs.avg_confidence,
      intentions: dims.intentions.completion_rate,
      deliberation: dims.deliberation.safety_pass_rate,
      episodes: dims.episodes.success_rate,
      pipeline: 1 - dims.pipeline.error_rate,
      world_model: dims.world_model.confidence,
      llm: 1 - dims.llm.budget_utilization,
    };

    for (const [dim, score] of Object.entries(scores)) {
      if (score < DIMENSION_THRESHOLDS[dim as DimensionName]) {
        weak.push(dim);
      }
    }
    return weak;
  }

  private normalizeDimension(_name: string, value: number): number {
    return Math.max(0, Math.min(1, value));
  }
}
