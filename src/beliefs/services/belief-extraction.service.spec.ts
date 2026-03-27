import { Test, TestingModule } from '@nestjs/testing';
import { BeliefExtractionService } from './belief-extraction.service';
import { BeliefsService } from '../beliefs.service';
import { BeliefPromotionService } from './belief-promotion.service';
import { MemoryAggregationService } from '../../memory/services/memory-aggregation.service';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';
import { SimilarityProvider } from '../../cognitive/similarity.provider';
import { BayesianUpdaterService } from '../../cognitive/bayesian-updater.service';
import { mockCognitiveConfig } from '../../__mocks__/cognitive-config.mock';

describe('BeliefExtractionService', () => {
  let service: BeliefExtractionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BeliefExtractionService,
        { provide: BeliefsService, useValue: { findAll: jest.fn(), create: jest.fn() } },
        { provide: BeliefPromotionService, useValue: { addToReviewQueue: jest.fn() } },
        { provide: MemoryAggregationService, useValue: { getDailyMemoriesSince: jest.fn() } },
        { provide: CognitiveConfigService, useValue: mockCognitiveConfig },
        { provide: SimilarityProvider, useValue: new SimilarityProvider(mockCognitiveConfig as CognitiveConfigService) },
        { provide: BayesianUpdaterService, useValue: { computePrior: jest.fn().mockReturnValue(0.4), updateWithEvidence: jest.fn().mockReturnValue({ point: 0.65, lower: 0.5, upper: 0.8 }), reinforcementBoost: jest.fn().mockReturnValue(0.03) } },
      ],
    }).compile();

    service = module.get(BeliefExtractionService);
  });

  describe('extractCandidates', () => {
    it('should extract from Russian communication patterns', () => {
      const content = 'предпочитаю структурированный вывод.';
      const candidates = service.extractCandidates(content, 'test');
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0].category).toBe('communication');
      expect(candidates[0].prefix).toBe('M');
    });

    it('should extract from workflow patterns', () => {
      const content = 'нужно добавить CI/CD pipeline.';
      const candidates = service.extractCandidates(content, 'test');
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0].category).toBe('workflow');
      expect(candidates[0].prefix).toBe('W');
    });

    it('should extract multiple candidates', () => {
      const content = 'предпочитаю TypeScript. нужно тесты. важно документация.';
      const candidates = service.extractCandidates(content, 'test');
      expect(candidates.length).toBeGreaterThanOrEqual(3);
    });

    it('should not extract from irrelevant text', () => {
      const content = 'The system is running fine. No issues detected.';
      const candidates = service.extractCandidates(content, 'test');
      expect(candidates).toHaveLength(0);
    });

    it('should skip too-short matches', () => {
      const content = 'нужно CI.';
      const candidates = service.extractCandidates(content, 'test');
      // "CI" is only 2 chars, should be filtered out (< 5)
      expect(candidates).toHaveLength(0);
    });
  });

  describe('findExistingBelief', () => {
    it('should find similar belief', () => {
      const beliefs = [
        { belief_id: 'B1', content: 'User prefers structured output format' } as any,
      ];
      const result = service.findExistingBelief(beliefs, 'User prefers structured output format always');
      expect(result).not.toBeNull();
      expect(result!.belief_id).toBe('B1');
    });

    it('should not match dissimilar beliefs', () => {
      const beliefs = [
        { belief_id: 'B1', content: 'The sky is blue and clear today' } as any,
      ];
      const result = service.findExistingBelief(beliefs, 'Database needs migration urgently');
      expect(result).toBeNull();
    });
  });

  describe('calculateSimilarity', () => {
    it('should return 1 for identical strings', () => {
      expect(service.calculateSimilarity('hello world test', 'hello world test')).toBe(1);
    });

    it('should return 0 for completely different strings', () => {
      expect(service.calculateSimilarity('alpha beta gamma', 'delta epsilon zeta')).toBe(0);
    });

    it('should return partial for overlapping strings', () => {
      const sim = service.calculateSimilarity('prefer structured output', 'prefer structured format');
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(1);
    });

    it('should handle empty strings', () => {
      expect(service.calculateSimilarity('', 'test')).toBe(0);
      expect(service.calculateSimilarity('test', '')).toBe(0);
    });
  });
});
