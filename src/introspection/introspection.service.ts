import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import {
  IntrospectionProfile,
  IntrospectionPosture,
  IntrospectionReport,
  IntrospectionStageResult,
  IntrospectionSummary,
} from '../common/types/introspection.types';
import { Belief, Contradiction } from '../common/types/belief.types';
import { BeliefsService } from '../beliefs/beliefs.service';
import { BeliefContradictionService } from '../beliefs/services/belief-contradiction.service';
import { BeliefDecayService } from '../beliefs/services/belief-decay.service';
import { BeliefExtractionService } from '../beliefs/services/belief-extraction.service';
import { MemoryService } from '../memory/memory.service';
import { WorldModelService } from '../world-model/world-model.service';
import { CognitiveConfigService } from '../cognitive/cognitive-config.service';

const FULL_STAGES = ['beliefs_snapshot', 'extraction', 'contradiction_scan', 'decay', 'memory_freshness', 'world_model_refresh', 'coherence', 'report'];
const SLEEP_STAGES = ['beliefs_snapshot', 'memory_freshness', 'coherence', 'report'];

@Injectable()
export class IntrospectionService {
  private readonly logger = new Logger(IntrospectionService.name);

  constructor(
    private readonly beliefs: BeliefsService,
    private readonly contradictions: BeliefContradictionService,
    private readonly decay: BeliefDecayService,
    private readonly extraction: BeliefExtractionService,
    private readonly memory: MemoryService,
    private readonly worldModel: WorldModelService,
    private readonly db: SurrealService,
    private readonly config: CognitiveConfigService,
  ) {}

  async run(profile: IntrospectionProfile = 'full'): Promise<Result<IntrospectionReport, DomainError>> {
    const stages = profile === 'full' ? FULL_STAGES : SLEEP_STAGES;
    const stageOutputs: Record<string, unknown> = {};
    const stageResults: IntrospectionStageResult[] = [];

    // beliefs_snapshot
    const allBeliefs = await this.beliefs.findAll();
    if (allBeliefs.isErr()) return err(allBeliefs.error);
    const beliefs = allBeliefs.value;
    const activeBeliefs = beliefs.filter((b) => b.status === 'active');
    const lowConfidence = activeBeliefs.filter((b) => b.confidence < this.config.get('introspection.low_confidence_threshold'));
    const avgConfidence = activeBeliefs.length > 0
      ? activeBeliefs.reduce((s, b) => s + b.confidence, 0) / activeBeliefs.length
      : 0;

    stageResults.push({ name: 'beliefs_snapshot', status: 'ok', data: { total: beliefs.length, active: activeBeliefs.length, low_confidence: lowConfidence.length } });
    stageOutputs.beliefs_snapshot = { total: beliefs.length, active: activeBeliefs.length, avg_confidence: avgConfidence };

    // extraction (full only)
    if (stages.includes('extraction')) {
      const extractResult = await this.extraction.extractFromMemory();
      stageResults.push({ name: 'extraction', status: extractResult.isOk() ? 'ok' : 'error', data: extractResult.isOk() ? extractResult.value as unknown as Record<string, unknown> : undefined });
      stageOutputs.extraction = extractResult.isOk() ? extractResult.value : { error: extractResult.error.message };
    }

    // contradiction_scan (full only)
    let contradictionsFound = 0;
    if (stages.includes('contradiction_scan')) {
      const contrResult = await this.contradictions.scanForContradictions();
      contradictionsFound = contrResult.isOk() ? contrResult.value.contradictions_found : 0;
      stageResults.push({ name: 'contradiction_scan', status: contrResult.isOk() ? 'ok' : 'error', data: contrResult.isOk() ? contrResult.value as unknown as Record<string, unknown> : undefined });
      stageOutputs.contradiction_scan = contrResult.isOk() ? contrResult.value : { error: contrResult.error.message };
    }

    // decay (full only)
    if (stages.includes('decay')) {
      const decayResult = await this.decay.runDecayCycle();
      stageResults.push({ name: 'decay', status: decayResult.isOk() ? 'ok' : 'error', data: decayResult.isOk() ? decayResult.value as unknown as Record<string, unknown> : undefined });
      stageOutputs.decay = decayResult.isOk() ? decayResult.value : { error: decayResult.error.message };
    }

    // memory_freshness
    const recentMemory = await this.memory.getRecentEntries(7);
    const memoryFreshnessDays = recentMemory.isOk() && recentMemory.value.length > 0
      ? Math.floor((Date.now() - new Date(recentMemory.value[0].day_key).getTime()) / 86400000)
      : 999;
    stageResults.push({ name: 'memory_freshness', status: 'ok', data: { days: memoryFreshnessDays } });
    stageOutputs.memory_freshness = { days: memoryFreshnessDays };

    // world_model_refresh (full only)
    if (stages.includes('world_model_refresh')) {
      const wmResult = await this.worldModel.build();
      stageResults.push({ name: 'world_model_refresh', status: wmResult.isOk() ? 'ok' : 'error' });
      stageOutputs.world_model_refresh = wmResult.isOk() ? { confidence: wmResult.value.confidence } : { error: wmResult.error.message };
    }

    // coherence
    const coherenceScore = this.calculateCoherence(activeBeliefs, contradictionsFound);
    const posture = this.classifyPosture(coherenceScore, lowConfidence.length);
    stageResults.push({ name: 'coherence', status: 'ok', data: { score: coherenceScore, posture } });
    stageOutputs.coherence = { score: coherenceScore, posture };

    // report
    const summary: IntrospectionSummary = {
      total_beliefs: beliefs.length,
      active_beliefs: activeBeliefs.length,
      low_confidence_count: lowConfidence.length,
      avg_confidence: Math.round(avgConfidence * 1000) / 1000,
      contradictions_found: contradictionsFound,
      memory_freshness_days: memoryFreshnessDays,
      posture,
      coherence_score: coherenceScore,
    };
    stageResults.push({ name: 'report', status: 'ok' });

    const report: IntrospectionReport = {
      profile,
      executed_stages: stageResults.map((s) => s.name),
      coherence_score: coherenceScore,
      posture,
      summary,
      stage_outputs: stageOutputs,
      generated_at: new Date().toISOString(),
    };

    // Persist
    await this.db.create('introspection_report', report as unknown as Record<string, unknown>);

    return ok(report);
  }

  async getLatestReport(): Promise<Result<IntrospectionReport | null, DomainError>> {
    const result = await this.db.query<IntrospectionReport>(
      'SELECT * FROM introspection_report ORDER BY generated_at DESC LIMIT 1',
    );
    if (result.isErr()) return err(result.error);
    return ok(result.value[0] || null);
  }

  calculateCoherence(beliefs: Belief[], contradictionsFound: number): number {
    if (beliefs.length === 0) return 0.5;
    const avgConf = beliefs.reduce((s, b) => s + b.confidence, 0) / beliefs.length;
    const lowThreshold = this.config.get('introspection.low_confidence_threshold');
    const lowCount = beliefs.filter((b) => b.confidence < lowThreshold).length;
    const lowRatio = lowCount / beliefs.length;

    const wAvg = this.config.get('introspection.coherence_w_avgconf');
    const wLow = this.config.get('introspection.coherence_w_lowratio');
    const cPenalty = this.config.get('introspection.coherence_penalty_per_contradiction');

    let score = avgConf * wAvg + (1 - lowRatio) * wLow;
    score -= contradictionsFound * cPenalty;
    return Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));
  }

  classifyPosture(coherence: number, lowConfidenceCount: number): IntrospectionPosture {
    if (coherence > this.config.get('introspection.threshold_stable') && lowConfidenceCount === 0) return 'stable';
    if (coherence > this.config.get('introspection.threshold_review')) return 'review';
    return 'repair';
  }
}
