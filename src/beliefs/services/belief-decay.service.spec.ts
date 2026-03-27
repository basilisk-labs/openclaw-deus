import { Test, TestingModule } from '@nestjs/testing';
import { BeliefDecayService } from './belief-decay.service';
import { BeliefsService } from '../beliefs.service';
import { SurrealService } from '../../database/surreal.service';
import { EventsService } from '../../events/events.service';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';
import { mockEventsService } from '../../__mocks__/events.mock';
import { mockCognitiveConfig } from '../../__mocks__/cognitive-config.mock';
import { Belief } from '../../common/types/belief.types';
import { ok } from 'neverthrow';

function makeBelief(overrides: Partial<Belief> = {}): Belief {
  return {
    id: 'belief:test',
    belief_id: 'B1',
    content: 'Test belief',
    confidence: 0.9,
    evidence_set: [],
    source_type: 'inference',
    belief_class: 'operational',
    decay_mode: 'normal',
    confidence_floor: 0.5,
    review_threshold: 0.7,
    context_scope: 'test',
    status: 'active',
    drift_history: [],
    timestamp_created: '2026-01-01T00:00:00Z',
    timestamp_updated: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('BeliefDecayService', () => {
  let service: BeliefDecayService;
  let beliefsService: jest.Mocked<BeliefsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BeliefDecayService,
        {
          provide: BeliefsService,
          useValue: {
            findAll: jest.fn(),
            update: jest.fn().mockResolvedValue(ok({})),
          },
        },
        { provide: SurrealService, useValue: { batchUpdate: jest.fn().mockResolvedValue(ok(0)), query: jest.fn().mockResolvedValue(ok([])) } },
        { provide: EventsService, useValue: mockEventsService },
        { provide: CognitiveConfigService, useValue: mockCognitiveConfig },
      ],
    }).compile();

    service = module.get(BeliefDecayService);
    beliefsService = module.get(BeliefsService);
  });

  describe('applyDecay', () => {
    it('should not decay beliefs with no_decay mode', () => {
      const belief = makeBelief({ decay_mode: 'no_decay', belief_class: 'axiom', confidence: 1.0, confidence_floor: 1.0 });
      const result = service.applyDecay(belief);
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().changed).toBe(false);
      expect(belief.confidence).toBe(1.0);
    });

    it('should apply exponential decay for normal mode', () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const belief = makeBelief({ confidence: 0.9, decay_mode: 'normal', timestamp_updated: thirtyDaysAgo });
      const result = service.applyDecay(belief);
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().changed).toBe(true);
      expect(belief.confidence).toBeLessThan(0.9);
      expect(belief.confidence).toBeGreaterThanOrEqual(0.5); // floor
    });

    it('should clamp to confidence floor', () => {
      const longAgo = new Date(Date.now() - 365 * 86400000).toISOString();
      const belief = makeBelief({
        confidence: 0.8,
        decay_mode: 'fast',
        confidence_floor: 0.3,
        timestamp_updated: longAgo,
      });
      const result = service.applyDecay(belief);
      expect(result.isOk()).toBe(true);
      expect(belief.confidence).toBe(0.3); // clamped to floor
    });

    it('should add drift_history entry when changed', () => {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const belief = makeBelief({ confidence: 0.9, timestamp_updated: weekAgo });
      service.applyDecay(belief);
      expect(belief.drift_history.length).toBeGreaterThanOrEqual(1);
      expect(belief.drift_history[belief.drift_history.length - 1].reason).toBe('time_decay');
    });

    it('should not change recently updated beliefs', () => {
      const belief = makeBelief({ confidence: 0.9, timestamp_updated: new Date().toISOString() });
      const result = service.applyDecay(belief);
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().changed).toBe(false);
    });
  });

  describe('isDecayExempt', () => {
    it('should exempt axiom class', () => {
      expect(service.isDecayExempt(makeBelief({ belief_class: 'axiom' }))).toBe(true);
    });

    it('should exempt I-prefixed beliefs', () => {
      expect(service.isDecayExempt(makeBelief({ belief_id: 'I1' }))).toBe(true);
    });

    it('should not exempt operational beliefs', () => {
      expect(service.isDecayExempt(makeBelief({ belief_id: 'B1', belief_class: 'operational' }))).toBe(false);
    });
  });

  describe('getDecayProfile', () => {
    it('should return correct profile for axiom', () => {
      const profile = service.getDecayProfile(makeBelief({ belief_class: 'axiom', decay_mode: 'no_decay', confidence_floor: 1.0 }));
      expect(profile.decay_rate).toBe(0);
      expect(profile.confidence_floor).toBe(1.0);
      expect(profile.archivable).toBe(false);
    });

    it('should return correct profile for hypothesis', () => {
      const profile = service.getDecayProfile(makeBelief({ belief_class: 'hypothesis', decay_mode: 'fast' }));
      expect(profile.decay_rate).toBe(0.02);
      expect(profile.archivable).toBe(true);
    });
  });

  describe('repairExemptBelief', () => {
    it('should restore confidence to floor for damaged axiom', () => {
      const belief = makeBelief({ belief_class: 'axiom', decay_mode: 'no_decay', confidence: 0.5, confidence_floor: 1.0 });
      const repaired = service.repairExemptBelief(belief);
      expect(repaired).toBe(true);
      expect(belief.confidence).toBe(1.0);
    });

    it('should restore status to active', () => {
      const belief = makeBelief({ belief_class: 'axiom', decay_mode: 'no_decay', confidence_floor: 1.0, status: 'deprecated' });
      service.repairExemptBelief(belief);
      expect(belief.status).toBe('active');
    });

    it('should not repair already correct belief', () => {
      const belief = makeBelief({ belief_class: 'axiom', decay_mode: 'no_decay', confidence: 1.0, confidence_floor: 1.0, status: 'active' });
      const repaired = service.repairExemptBelief(belief);
      expect(repaired).toBe(false);
    });
  });

  describe('runDecayCycle', () => {
    it('should process all beliefs and return stats', async () => {
      beliefsService.findAll.mockResolvedValue(ok([
        makeBelief({ belief_id: 'B1', timestamp_updated: new Date(Date.now() - 7 * 86400000).toISOString() }),
        makeBelief({ belief_id: 'I1', belief_class: 'axiom', decay_mode: 'no_decay', confidence: 1.0, confidence_floor: 1.0 }),
      ]));

      const result = await service.runDecayCycle();
      expect(result.isOk()).toBe(true);
      const stats = result._unsafeUnwrap();
      expect(stats.total_beliefs).toBe(2);
    });
  });
});
