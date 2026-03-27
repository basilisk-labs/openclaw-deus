import { Test, TestingModule } from '@nestjs/testing';
import { DeliberationService } from './deliberation.service';
import { SurrealService } from '../database/surreal.service';
import { EventsService } from '../events/events.service';
import { LlmClientService } from '../llm/llm-client.service';
import { DissensusService } from '../policy/services/dissensus.service';
import { RipenessService } from '../policy/services/ripeness.service';
import { IntentNormalizerService } from '../policy/services/intent-normalizer.service';
import { EpisodeService } from '../experience/episode.service';
import { CausalGraphService } from '../cognitive/causal-graph.service';
import { TemporalCognitionService } from '../cognitive/temporal-cognition.service';
import { mockEventsService } from '../__mocks__/events.mock';
import { ok } from 'neverthrow';
import { Intention } from '../common/types/intention.types';

const mockIntention: Intention = {
  intention_id: 'INT001',
  description: 'Write unit tests for auth module',
  kind: 'task',
  source: 'operator_explicit',
  status: 'active',
  children_ids: [],
  success_criteria: 'All auth tests pass',
  progress: { estimated_completion: 0, last_action: '', blockers: [] },
  recognized_at: new Date().toISOString(),
  relevant_knowledge_ids: [],
  priority: 0.8,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function buildModule(overrides: {
  llmAvailable?: boolean;
  dissensusDecision?: string;
  ripenessScore?: number;
  ripenessClass?: string;
  pastEpisodes?: unknown[];
} = {}) {
  const {
    llmAvailable = false,
    dissensusDecision = 'allow',
    ripenessScore = 0.8,
    ripenessClass = 'ready',
    pastEpisodes = [],
  } = overrides;

  return Test.createTestingModule({
    providers: [
      DeliberationService,
      IntentNormalizerService,
      { provide: SurrealService, useValue: { create: jest.fn().mockResolvedValue(ok({})) } },
      { provide: EventsService, useValue: mockEventsService },
      { provide: LlmClientService, useValue: { isAvailable: jest.fn().mockReturnValue(llmAvailable) } },
      {
        provide: DissensusService,
        useValue: {
          evaluate: jest.fn().mockReturnValue(
            ok({ decision: dissensusDecision, trigger_type: dissensusDecision === 'allow' ? 'none' : 'invariant_conflict', reason: 'test' }),
          ),
        },
      },
      {
        provide: RipenessService,
        useValue: {
          score: jest.fn().mockReturnValue({
            score: ripenessScore, class: ripenessClass,
            blockers: [], missing_preconditions: [], factor_scores: {}, rationale: '',
          }),
        },
      },
      {
        provide: EpisodeService,
        useValue: {
          findByIntention: jest.fn().mockResolvedValue(ok(pastEpisodes)),
          findRecent: jest.fn().mockResolvedValue(ok([])),
        },
      },
      {
        provide: CausalGraphService,
        useValue: {
          build: jest.fn().mockResolvedValue({ isOk: () => true, isErr: () => false, value: { nodes: [], edges: [] } }),
          predictGoalSuccess: jest.fn().mockReturnValue({ success_probability: 0.5, blockers: [] }),
          getTopVOIBeliefs: jest.fn().mockReturnValue([]),
        },
      },
      {
        provide: TemporalCognitionService,
        useValue: {
          anticipate: jest.fn().mockResolvedValue({ isOk: () => true, isErr: () => false, value: { expected_cycles: 3, confidence: 0.5, basis: 'default', urgency: 0.3 } }),
          perceive: jest.fn().mockResolvedValue({ isOk: () => true, value: { cognitive_age: 10, events_since_rest: 5, tempo: 3, dilation: 1, phase: 'active' } }),
        },
      },
    ],
  }).compile();
}

describe('DeliberationService', () => {
  let service: DeliberationService;

  beforeEach(async () => {
    const module: TestingModule = await buildModule();
    service = module.get(DeliberationService);
  });

  describe('fallback mode output structure', () => {
    it('should produce exactly one option when LLM unavailable', async () => {
      const result = await service.deliberate(mockIntention);
      expect(result.isOk()).toBe(true);
      const delib = result._unsafeUnwrap();
      expect(delib.deliberation.options).toHaveLength(1);
    });

    it('should set selected_option to 0 in fallback', async () => {
      const result = await service.deliberate(mockIntention);
      const delib = result._unsafeUnwrap();
      expect(delib.deliberation.selected_option).toBe(0);
    });

    it('should include reasoning explaining LLM unavailability', async () => {
      const result = await service.deliberate(mockIntention);
      const delib = result._unsafeUnwrap();
      expect(delib.deliberation.reasoning).toContain('LLM unavailable');
    });

    it('should set commitment_level to tentative in fallback', async () => {
      const result = await service.deliberate(mockIntention);
      const delib = result._unsafeUnwrap();
      expect(delib.deliberation.commitment_level).toBe('tentative');
    });

    it('should set outcome to pending', async () => {
      const result = await service.deliberate(mockIntention);
      const delib = result._unsafeUnwrap();
      expect(delib.deliberation.outcome).toBe('pending');
    });

    it('should include intention description in the action', async () => {
      const result = await service.deliberate(mockIntention);
      const delib = result._unsafeUnwrap();
      expect(delib.action_to_take).toContain('Write unit tests');
    });

    it('should set trigger to new_intention', async () => {
      const result = await service.deliberate(mockIntention);
      const delib = result._unsafeUnwrap();
      expect(delib.deliberation.trigger).toBe('new_intention');
    });

    it('should include the intention_id on the deliberation', async () => {
      const result = await service.deliberate(mockIntention);
      const delib = result._unsafeUnwrap();
      expect(delib.deliberation.intention_id).toBe('INT001');
    });

    it('should set approach to standard in fallback option', async () => {
      const result = await service.deliberate(mockIntention);
      const option = result._unsafeUnwrap().deliberation.options[0];
      expect(option.approach).toBe('standard');
    });

    it('should list LLM unavailability as a risk', async () => {
      const result = await service.deliberate(mockIntention);
      const option = result._unsafeUnwrap().deliberation.options[0];
      expect(option.risks.some(r => r.toLowerCase().includes('llm'))).toBe(true);
    });
  });

  describe('safety check integration', () => {
    it('should pass safety when dissensus allows', async () => {
      const result = await service.deliberate(mockIntention);
      expect(result._unsafeUnwrap().safety_passed).toBe(true);
    });

    it('should mark safety_passed true in fallback (no dissensus check)', async () => {
      // Fallback mode returns safety_passed = true without running dissensus
      const result = await service.deliberate(mockIntention);
      expect(result._unsafeUnwrap().safety_passed).toBe(true);
    });
  });

  describe('reasoning quality', () => {
    it('should provide non-empty reasoning string', async () => {
      const result = await service.deliberate(mockIntention);
      const delib = result._unsafeUnwrap();
      expect(delib.deliberation.reasoning.length).toBeGreaterThan(0);
    });

    it('should produce estimated_success between 0 and 1', async () => {
      const result = await service.deliberate(mockIntention);
      const option = result._unsafeUnwrap().deliberation.options[0];
      expect(option.estimated_success).toBeGreaterThanOrEqual(0);
      expect(option.estimated_success).toBeLessThanOrEqual(1);
    });
  });
});
