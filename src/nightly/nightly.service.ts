import { Injectable, Inject, Logger, forwardRef } from '@nestjs/common';
import { Result, ok } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { NightlyRunResult, NightlyStageResult } from '../common/types/introspection.types';
import { MemoryAggregationService } from '../memory/services/memory-aggregation.service';
import { IntrospectionService } from '../introspection/introspection.service';
import { BeliefDecayService } from '../beliefs/services/belief-decay.service';
import { BeliefPromotionService } from '../beliefs/services/belief-promotion.service';
import { KnowledgeExtractionService } from '../knowledge/services/knowledge-extraction.service';
import { KnowledgeGapService } from '../knowledge/services/knowledge-gap.service';
import { ProcedureService } from '../experience/procedure.service';
import { SelfAssessmentService } from '../experience/self-assessment.service';
import { IntentionStackService } from '../intention/services/intention-stack.service';
import { CalibrationService } from '../cognitive/calibration.service';
import { CognitiveConfigService } from '../cognitive/cognitive-config.service';
import { WorldModelService } from '../world-model/world-model.service';
import { EventsService } from '../events/events.service';
import { MetricsService } from '../metrics/metrics.service';
import { RecursiveImproveService } from '../metrics/recursive-improve.service';
import { CausalGraphService } from '../cognitive/causal-graph.service';
import { MetaLearningService } from '../cognitive/meta-learning.service';
import { NarrativeService } from '../kernel/narrative/narrative.service';

@Injectable()
export class NightlyService {
  private readonly logger = new Logger(NightlyService.name);

  constructor(
    private readonly aggregation: MemoryAggregationService,
    private readonly introspection: IntrospectionService,
    private readonly decay: BeliefDecayService,
    private readonly promotion: BeliefPromotionService,
    private readonly knowledgeExtraction: KnowledgeExtractionService,
    private readonly gaps: KnowledgeGapService,
    private readonly procedures: ProcedureService,
    private readonly selfAssessment: SelfAssessmentService,
    private readonly intentionStack: IntentionStackService,
    private readonly calibration: CalibrationService,
    private readonly config: CognitiveConfigService,
    private readonly worldModel: WorldModelService,
    private readonly events: EventsService,
    private readonly db: SurrealService,
    @Inject(forwardRef(() => MetricsService)) private readonly metrics: MetricsService,
    @Inject(forwardRef(() => RecursiveImproveService)) private readonly recursiveImprove: RecursiveImproveService,
    private readonly causalGraph: CausalGraphService,
    private readonly metaLearning: MetaLearningService,
    private readonly narrative: NarrativeService,
  ) {}

  async run(now?: Date): Promise<Result<NightlyRunResult, DomainError>> {
    const startedAt = (now || new Date()).toISOString();
    const stages: NightlyStageResult[] = [];

    const runStage = async (name: string, fn: () => Promise<any>): Promise<void> => {
      this.logger.log(`Nightly: ${name}`);
      try {
        const result = await fn();
        const data = result?.isOk ? (result.isOk() ? result.value : { error: result.error?.message }) : result;
        stages.push({ name, status: 'ok', result: data || {} });
      } catch (error: any) {
        this.logger.error(`Nightly ${name} failed: ${error.message}`);
        stages.push({ name, status: 'error', result: { error: error.message } });
      }
      await this.events.emit('nightly.stage_completed', { stage: name, status: stages[stages.length - 1].status });
    };

    // === Phase 1: Data collection ===
    await runStage('memory_aggregate', () => this.aggregation.aggregateDay());

    // === Phase 2: Knowledge processing ===
    await runStage('knowledge_consolidation', async () => {
      // Extract knowledge from today's aggregated memory
      const today = new Date().toISOString().slice(0, 10);
      const memory = await this.aggregation.getDailyMemory(today);
      if (memory.isOk() && memory.value) {
        const content = Object.values(memory.value.sections || {}).flat().join('\n');
        if (content.length > 50) {
          return this.knowledgeExtraction.extractFromInteraction(content);
        }
      }
      return { extracted: 0 };
    });

    await runStage('sleep', () => this.introspection.run('sleep'));

    // === Phase 3: Full analysis ===
    await runStage('introspect', () => this.introspection.run('full'));

    await runStage('causal_analysis', async () => {
      const graph = await this.causalGraph.build();
      if (graph.isErr()) return { error: graph.error.message };
      const topVOI = this.causalGraph.getTopVOIBeliefs(graph.value, 5);
      return {
        nodes: graph.value.nodes.length,
        edges: graph.value.edges.length,
        learning_priorities: topVOI.map(v => ({ belief: v.label, voi: v.voi })),
      };
    });

    await runStage('decay_tune', () => this.decay.runDecayCycle());

    await runStage('belief_review', () => this.promotion.runPromotionReview());

    // === Phase 4: Experience processing ===
    await runStage('procedure_extraction', () => this.procedures.extractFromEpisodes());

    await runStage('self_assessment', () => this.selfAssessment.updateFromEpisodes());

    // === Phase 5: Maintenance ===
    await runStage('intention_review', async () => {
      const stale = await this.intentionStack.findStaleIntentions(3);
      const adopted = await this.intentionStack.autoAdopt();
      return {
        stale_intentions: stale.isOk() ? stale.value.length : 0,
        auto_adopted: adopted.isOk() ? adopted.value : 0,
      };
    });

    await runStage('knowledge_gap_triage', async () => {
      // Triage: close stale gaps, then report (proposed by DiagnosisService)
      const triage = await this.gaps.triageGaps(14);
      const highImpact = await this.gaps.findHighImpact(0.7);
      return {
        ...(triage.isOk() ? triage.value : { closed_stale: 0, remaining: 0 }),
        high_impact: highImpact.isOk() ? highImpact.value.length : 0,
      };
    });

    // === Phase 6: Self-tuning ===
    await runStage('cognitive_config_tuning', async () => {
      const cal = await this.calibration.computeCalibration();
      if (cal.isOk()) {
        await this.config.adjustFromFeedback({
          overconfident: cal.value.overconfident,
          underconfident: cal.value.underconfident,
        });
        return { ece: cal.value.ece, adjusted: true };
      }
      return { ece: 0, adjusted: false };
    });

    // === Phase 7: Rebuild world model ===
    await runStage('world_model_rebuild', () => this.worldModel.build());

    // === Phase 8: Narrative compaction + synthesis ===
    await runStage('narrative_compact', () => this.narrative.compact());
    await runStage('narrative_synthesis', () => this.narrative.narrate());

    // === Phase 9: Meta-learning + Recursive self-improvement ===
    await runStage('meta_learning', () => this.metaLearning.analyze());
    await runStage('cognitive_metrics', () => this.metrics.snapshot());
    await runStage('recursive_improve', () => this.recursiveImprove.run());

    const finishedAt = new Date().toISOString();
    const nightlyResult: NightlyRunResult = {
      stages,
      stage_order: stages.map((s) => s.name),
      summary: {
        total_stages: stages.length,
        passed: stages.filter((s) => s.status === 'ok').length,
        failed: stages.filter((s) => s.status === 'error').length,
      },
      started_at: startedAt,
      finished_at: finishedAt,
    };

    await this.db.create('nightly_run', nightlyResult as unknown as Record<string, unknown>);
    await this.events.emit('nightly.completed', nightlyResult.summary);

    this.logger.log(`Nightly complete: ${nightlyResult.summary.passed}/${nightlyResult.summary.total_stages} stages passed`);
    return ok(nightlyResult);
  }
}
