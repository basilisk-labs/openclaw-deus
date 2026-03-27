import { Test, TestingModule } from '@nestjs/testing';
import { WorldModelService } from './world-model.service';
import { BeliefsService } from '../beliefs/beliefs.service';
import { MemoryService } from '../memory/memory.service';
import { IntentionService } from '../intention/intention.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { KnowledgeGapService } from '../knowledge/services/knowledge-gap.service';
import { OperatorModelService } from '../operator-model/operator-model.service';
import { EpisodeService } from '../experience/episode.service';
import { SurrealService } from '../database/surreal.service';
import { CognitiveConfigService } from '../cognitive/cognitive-config.service';
import { TemporalCognitionService } from '../cognitive/temporal-cognition.service';
import { ConceptSpaceService } from '../kernel/space/concept-space.service';
import { mockCognitiveConfig } from '../__mocks__/cognitive-config.mock';
import { ok } from 'neverthrow';
import { Belief } from '../common/types/belief.types';

function makeBelief(id: string, overrides: Partial<Belief> = {}): Belief {
  return {
    id: `belief:${id}`, belief_id: id, content: `Belief ${id}`, confidence: 0.9,
    evidence_set: [], source_type: 'inference', belief_class: 'operational',
    decay_mode: 'normal', confidence_floor: 0.5, review_threshold: 0.7,
    context_scope: 'test', status: 'active', drift_history: [],
    timestamp_created: '2026-01-01T00:00:00Z', timestamp_updated: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const mockOk = (data: any = {}) => jest.fn().mockResolvedValue(ok(data));

describe('WorldModelService', () => {
  let service: WorldModelService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorldModelService,
        { provide: BeliefsService, useValue: {
          findAll: jest.fn().mockResolvedValue(ok([
            makeBelief('I1', { belief_class: 'axiom', confidence: 1.0 }),
            makeBelief('B1'),
            makeBelief('B2', { belief_class: 'user_model', content: 'User prefers TS' }),
          ])),
        }},
        { provide: MemoryService, useValue: {
          getRecentEntries: jest.fn().mockResolvedValue(ok([{ day_key: '2026-03-25' }])),
        }},
        { provide: IntentionService, useValue: {
          findActive: mockOk([{ intention_id: 'INT001', description: 'Ship auth', kind: 'goal', source: 'operator_explicit', status: 'active', priority: 0.9, progress: { blockers: [] } }]),
        }},
        { provide: KnowledgeService, useValue: {
          findAll: mockOk([{ knowledge_id: 'K001', kind: 'fact', content: 'Uses NestJS', confidence: { point: 0.9 } }]),
        }},
        { provide: KnowledgeGapService, useValue: {
          findOpen: mockOk([]),
          findHighImpact: mockOk([]),
        }},
        { provide: OperatorModelService, useValue: {
          getModel: mockOk({ expertise: [{ domain: 'TypeScript', level: 'expert' }], patterns: { review_style: 'results_only', prefers_autonomous_work: true }, session: { frustration_signals: 0 } }),
        }},
        { provide: EpisodeService, useValue: {
          getSuccessRate: mockOk(0.85),
        }},
        { provide: SurrealService, useValue: {
          query: mockOk([]),
          queryRaw: jest.fn().mockResolvedValue(ok([{
            beliefs: { c: 3, avg: 0.85 },
            axioms: [{ id: 'I1', content: 'Invariant 1', confidence: 1.0 }],
            knowledge_count: 5,
            k_axioms: [],
            intentions: [{ intention_id: 'INT001', description: 'Ship auth', kind: 'goal', source: 'operator_explicit', status: 'active', priority: 0.9, progress: { blockers: [] } }],
            gaps_open: [],
            gaps_high: [],
            ep_stats: { total: 10, successes: 8 },
            latest_mem: { day_key: '2026-03-25' },
            latest_intro: { generated_at: '2026-03-25T00:00:00Z' },
            operator: { expertise: [{ domain: 'TypeScript', level: 'expert' }], patterns: { review_style: 'results_only', prefers_autonomous_work: true }, session: { frustration_signals: 0 } },
            contradictions: 0,
          }])),
          create: mockOk({}),
        } },
        { provide: CognitiveConfigService, useValue: mockCognitiveConfig },
        { provide: TemporalCognitionService, useValue: { perceive: jest.fn().mockResolvedValue({ isOk: () => true, value: { cognitive_age: 10, tempo: 3, dilation: 1, phase: 'active' } }), subjectiveDurationSince: jest.fn().mockResolvedValue({ isOk: () => true, value: { felt_hours: 1, clock_hours: 1, dilation_ratio: 1 } }) } },
        { provide: ConceptSpaceService, useValue: { getDimensionCount: jest.fn().mockReturnValue(0) } },
      ],
    }).compile();

    service = module.get(WorldModelService);
  });

  describe('build', () => {
    it('should build v2 world model with all data sources', async () => {
      const result = await service.build();
      expect(result.isOk()).toBe(true);
      const wm = result._unsafeUnwrap();
      expect(wm.version).toBe(2);
      expect(wm.confidence).toBeGreaterThan(0);
    });

    it('should include intentions in workspace model', async () => {
      const result = await service.build();
      const wm = result._unsafeUnwrap();
      expect(wm.workspace_model.active_project).toBe('Ship auth');
      expect(wm.workspace_model.mode).toBe('active');
    });

    it('should include operator expertise in human model', async () => {
      const result = await service.build();
      const wm = result._unsafeUnwrap();
      expect(wm.human_model.preferences).toContain('TypeScript: expert');
    });

    it('should include active requests from intentions', async () => {
      const result = await service.build();
      const wm = result._unsafeUnwrap();
      expect(wm.human_model.active_requests.length).toBeGreaterThan(0);
    });

    it('should set preferred_modes based on operator autonomy preference', async () => {
      const result = await service.build();
      const wm = result._unsafeUnwrap();
      expect(wm.action_priors.preferred_modes).toContain('direct_act');
    });
  });

  describe('isFresh', () => {
    it('should be fresh when recently generated', () => {
      const model = { generated_at: new Date().toISOString() } as any;
      expect(service.isFresh(model)).toBe(true);
    });

    it('should be stale after configured hours', () => {
      const oldDate = new Date(Date.now() - 7 * 3600000).toISOString();
      const model = { generated_at: oldDate } as any;
      expect(service.isFresh(model)).toBe(false);
    });
  });
});
