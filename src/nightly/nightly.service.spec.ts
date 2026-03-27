import { Test, TestingModule } from '@nestjs/testing';
import { NightlyService } from './nightly.service';
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
import { SurrealService } from '../database/surreal.service';
import { MetricsService } from '../metrics/metrics.service';
import { RecursiveImproveService } from '../metrics/recursive-improve.service';
import { CausalGraphService } from '../cognitive/causal-graph.service';
import { MetaLearningService } from '../cognitive/meta-learning.service';
import { NarrativeService } from '../kernel/narrative/narrative.service';
import { mockEventsService } from '../__mocks__/events.mock';
import { mockCognitiveConfig } from '../__mocks__/cognitive-config.mock';
import { ok, err } from 'neverthrow';
import { ValidationError } from '../common/types/result.types';

const mockOk = (data: any = {}) => jest.fn().mockResolvedValue(ok(data));

describe('NightlyService', () => {
  let service: NightlyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NightlyService,
        { provide: MemoryAggregationService, useValue: { aggregateDay: mockOk({ day_key: '2026-03-25' }), getDailyMemory: mockOk({ sections: { 'Git Activity': ['test'] } }) } },
        { provide: IntrospectionService, useValue: { run: mockOk({ posture: 'stable', coherence_score: 0.9 }) } },
        { provide: BeliefDecayService, useValue: { runDecayCycle: mockOk({ decayed: 2 }) } },
        { provide: BeliefPromotionService, useValue: { runPromotionReview: mockOk({ promoted: 1 }) } },
        { provide: KnowledgeExtractionService, useValue: { extractFromInteraction: mockOk({ new_knowledge: [], updated_knowledge: [], knowledge_gaps: [] }) } },
        { provide: KnowledgeGapService, useValue: { findOpen: mockOk([]), findHighImpact: mockOk([]) } },
        { provide: ProcedureService, useValue: { extractFromEpisodes: mockOk([]) } },
        { provide: SelfAssessmentService, useValue: { updateFromEpisodes: mockOk([]) } },
        { provide: IntentionStackService, useValue: { findStaleIntentions: mockOk([]), autoAdopt: mockOk(0) } },
        { provide: CalibrationService, useValue: { computeCalibration: mockOk({ ece: 0.05, overconfident: false, underconfident: false }) } },
        { provide: CognitiveConfigService, useValue: mockCognitiveConfig },
        { provide: WorldModelService, useValue: { build: mockOk({ confidence: 0.8 }) } },
        { provide: EventsService, useValue: mockEventsService },
        { provide: SurrealService, useValue: { create: mockOk({}) } },
        { provide: MetricsService, useValue: { snapshot: mockOk({}) } },
        { provide: RecursiveImproveService, useValue: { run: mockOk({}) } },
        { provide: CausalGraphService, useValue: { build: jest.fn().mockResolvedValue({ isOk: () => true, isErr: () => false, value: { nodes: [], edges: [] } }), getTopVOIBeliefs: jest.fn().mockReturnValue([]) } },
        { provide: MetaLearningService, useValue: { analyze: jest.fn().mockResolvedValue({ isOk: () => true, value: {} }) } },
        { provide: NarrativeService, useValue: { compact: jest.fn().mockResolvedValue({ isOk: () => true, value: { compacted: 0, frames_created: 0 } }), narrate: jest.fn().mockResolvedValue({ isOk: () => true, value: {} }) } },
      ],
    }).compile();

    service = module.get(NightlyService);
  });

  it('should execute all 14 stages', async () => {
    const result = await service.run();
    expect(result.isOk()).toBe(true);
    const run = result._unsafeUnwrap();
    expect(run.stages.length).toBe(18);
    expect(run.summary.total_stages).toBe(18);
  });

  it('should report passed/failed in summary', async () => {
    const result = await service.run();
    const run = result._unsafeUnwrap();
    const summary = run.summary as any;
    expect(summary.passed + summary.failed).toBe(18);
    expect(summary.passed).toBeGreaterThanOrEqual(10);
  });

  it('should continue even if one stage fails', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NightlyService,
        { provide: MemoryAggregationService, useValue: { aggregateDay: jest.fn().mockResolvedValue(err(new ValidationError('fail'))), getDailyMemory: mockOk(null) } },
        { provide: IntrospectionService, useValue: { run: mockOk({ posture: 'stable', coherence_score: 0.9 }) } },
        { provide: BeliefDecayService, useValue: { runDecayCycle: mockOk({}) } },
        { provide: BeliefPromotionService, useValue: { runPromotionReview: mockOk({}) } },
        { provide: KnowledgeExtractionService, useValue: { extractFromInteraction: mockOk({}) } },
        { provide: KnowledgeGapService, useValue: { findOpen: mockOk([]), findHighImpact: mockOk([]) } },
        { provide: ProcedureService, useValue: { extractFromEpisodes: mockOk([]) } },
        { provide: SelfAssessmentService, useValue: { updateFromEpisodes: mockOk([]) } },
        { provide: IntentionStackService, useValue: { findStaleIntentions: mockOk([]), autoAdopt: mockOk(0) } },
        { provide: CalibrationService, useValue: { computeCalibration: mockOk({ ece: 0, overconfident: false, underconfident: false }) } },
        { provide: CognitiveConfigService, useValue: mockCognitiveConfig },
        { provide: WorldModelService, useValue: { build: mockOk({}) } },
        { provide: EventsService, useValue: mockEventsService },
        { provide: SurrealService, useValue: { create: mockOk({}) } },
        { provide: MetricsService, useValue: { snapshot: mockOk({}) } },
        { provide: RecursiveImproveService, useValue: { run: mockOk({}) } },
        { provide: CausalGraphService, useValue: { build: jest.fn().mockResolvedValue({ isOk: () => true, isErr: () => false, value: { nodes: [], edges: [] } }), getTopVOIBeliefs: jest.fn().mockReturnValue([]) } },
        { provide: MetaLearningService, useValue: { analyze: jest.fn().mockResolvedValue({ isOk: () => true, value: {} }) } },
        { provide: NarrativeService, useValue: { compact: jest.fn().mockResolvedValue({ isOk: () => true, value: { compacted: 0, frames_created: 0 } }), narrate: jest.fn().mockResolvedValue({ isOk: () => true, value: {} }) } },
      ],
    }).compile();

    const svc = module.get(NightlyService);
    const result = await svc.run();
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().stages.length).toBe(18);
  });

  it('should set timestamps', async () => {
    const result = await service.run();
    const run = result._unsafeUnwrap();
    expect(run.started_at).toBeDefined();
    expect(run.finished_at).toBeDefined();
  });

  it('should include v4 stages', async () => {
    const result = await service.run();
    const names = result._unsafeUnwrap().stage_order;
    expect(names).toContain('knowledge_consolidation');
    expect(names).toContain('procedure_extraction');
    expect(names).toContain('self_assessment');
    expect(names).toContain('intention_review');
    expect(names).toContain('knowledge_gap_triage');
    expect(names).toContain('cognitive_config_tuning');
    expect(names).toContain('world_model_rebuild');
    expect(names).toContain('causal_analysis');
    expect(names).toContain('meta_learning');
  });
});
