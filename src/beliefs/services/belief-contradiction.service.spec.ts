import { Test, TestingModule } from '@nestjs/testing';
import { BeliefContradictionService } from './belief-contradiction.service';
import { BeliefsService } from '../beliefs.service';
import { SurrealService } from '../../database/surreal.service';
import { EventsService } from '../../events/events.service';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';
import { SimilarityProvider } from '../../cognitive/similarity.provider';
import { mockEventsService } from '../../__mocks__/events.mock';
import { mockCognitiveConfig } from '../../__mocks__/cognitive-config.mock';
import { Belief } from '../../common/types/belief.types';
import { ok } from 'neverthrow';

function makeBelief(overrides: Partial<Belief> = {}): Belief {
  return {
    id: 'belief:test',
    belief_id: 'B1',
    content: 'Test belief',
    confidence: 0.8,
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

describe('BeliefContradictionService', () => {
  let service: BeliefContradictionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BeliefContradictionService,
        {
          provide: BeliefsService,
          useValue: {
            findAll: jest.fn(),
            update: jest.fn().mockResolvedValue(ok({})),
          },
        },
        { provide: SurrealService, useValue: { relate: jest.fn().mockResolvedValue(ok({})), batchUpdate: jest.fn().mockResolvedValue(ok(0)) } },
        { provide: EventsService, useValue: mockEventsService },
        { provide: CognitiveConfigService, useValue: mockCognitiveConfig },
        { provide: SimilarityProvider, useValue: new SimilarityProvider(mockCognitiveConfig as CognitiveConfigService) },
      ],
    }).compile();

    service = module.get(BeliefContradictionService);
  });

  describe('isNegation', () => {
    it('should detect Russian negation "не"', () => {
      expect(service.isNegation(
        'Пользователь предпочитает краткий вывод',
        'Пользователь не предпочитает краткий вывод',
      )).toBe(true);
    });

    it('should not flag unrelated content as negation', () => {
      expect(service.isNegation(
        'Пользователь работает с TypeScript',
        'Пользователь не любит кофе',
      )).toBe(false);
    });
  });

  describe('isSimilarContent (uses SimilarityProvider)', () => {
    it('should detect similar content', () => {
      expect(service.isSimilarContent('тестовый контент здесь пример', 'тестовый контент здесь пример')).toBe(true);
    });

    it('should not match completely different text', () => {
      expect(service.isSimilarContent('альфа бета гамма', 'дельта эпсилон зета')).toBe(false);
    });
  });

  describe('findContradictions', () => {
    it('should find negation-based contradiction within same scope', () => {
      const beliefs = [
        makeBelief({ belief_id: 'B1', content: 'Пользователь предпочитает краткий вывод', context_scope: 'comm' }),
        makeBelief({ belief_id: 'B2', content: 'Пользователь не предпочитает краткий вывод', context_scope: 'comm' }),
      ];
      const contradictions = service.findContradictions(beliefs);
      expect(contradictions.length).toBeGreaterThan(0);
      expect(contradictions[0].severity).toBe('high');
    });

    it('should find confidence divergence', () => {
      const beliefs = [
        makeBelief({ belief_id: 'B1', content: 'важно тестирование модулей', confidence: 0.9, context_scope: 'test' }),
        makeBelief({ belief_id: 'B2', content: 'важно тестирование модулей правильное', confidence: 0.2, context_scope: 'test' }),
      ];
      const contradictions = service.findContradictions(beliefs);
      const divergence = contradictions.find((c) => c.reason === 'confidence_divergence');
      expect(divergence).toBeDefined();
      expect(divergence!.severity).toBe('medium');
    });

    it('should not compare across different scopes', () => {
      const beliefs = [
        makeBelief({ belief_id: 'B1', content: 'Не использовать тесты', context_scope: 'scope_a' }),
        makeBelief({ belief_id: 'B2', content: 'Использовать тесты', context_scope: 'scope_b' }),
      ];
      const contradictions = service.findContradictions(beliefs);
      expect(contradictions).toHaveLength(0);
    });

    it('should skip archived beliefs', () => {
      const beliefs = [
        makeBelief({ belief_id: 'B1', content: 'Не нужны тесты', status: 'archived', context_scope: 'x' }),
        makeBelief({ belief_id: 'B2', content: 'Нужны тесты', context_scope: 'x' }),
      ];
      const contradictions = service.findContradictions(beliefs);
      expect(contradictions).toHaveLength(0);
    });
  });

  describe('resolveContradictions', () => {
    it('should reduce confidence for high-severity contradictions', () => {
      const b1 = makeBelief({ belief_id: 'B1', confidence: 0.9 });
      const b2 = makeBelief({ belief_id: 'B2', confidence: 0.8 });
      const contradictions = [{
        belief_1: 'B1', belief_2: 'B2',
        content_1: '', content_2: '',
        severity: 'high' as const, scope: 'test',
      }];

      service.resolveContradictions(contradictions, [b1, b2]);
      expect(b1.confidence).toBe(0.9 * 0.8);
      expect(b2.confidence).toBe(0.8 * 0.8);
      expect(b1.status).toBe('review_needed');
      expect(b2.status).toBe('review_needed');
    });
  });
});
