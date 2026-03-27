import { Test, TestingModule } from '@nestjs/testing';
import { BeliefPromotionService } from './belief-promotion.service';
import { BeliefsService } from '../beliefs.service';
import { SurrealService } from '../../database/surreal.service';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';
import { SimilarityProvider } from '../../cognitive/similarity.provider';
import { mockCognitiveConfig } from '../../__mocks__/cognitive-config.mock';
import { ReviewCandidate } from '../../common/types/belief.types';

function makeCandidate(overrides: Partial<ReviewCandidate> = {}): ReviewCandidate {
  return {
    id: 'review:test',
    content: 'Test candidate',
    confidence_proposal: 0.7,
    recurrence: 1,
    source: '2026-03-25',
    category: 'workflow',
    prefix: 'W',
    human_review_needed: 'no',
    status: 'pending',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('BeliefPromotionService', () => {
  let service: BeliefPromotionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BeliefPromotionService,
        { provide: BeliefsService, useValue: { findAll: jest.fn(), create: jest.fn(), update: jest.fn() } },
        { provide: SurrealService, useValue: { query: jest.fn(), create: jest.fn(), update: jest.fn() } },
        { provide: CognitiveConfigService, useValue: mockCognitiveConfig },
        { provide: SimilarityProvider, useValue: new SimilarityProvider(mockCognitiveConfig as CognitiveConfigService) },
      ],
    }).compile();

    service = module.get(BeliefPromotionService);
  });

  describe('decidePromotion', () => {
    it('should promote when recurrence >= 3 and confidence >= 0.6', () => {
      expect(service.decidePromotion(makeCandidate({ recurrence: 3, confidence_proposal: 0.7 }))).toBe('promote');
      expect(service.decidePromotion(makeCandidate({ recurrence: 5, confidence_proposal: 0.6 }))).toBe('promote');
    });

    it('should defer when recurrence == 2 and confidence >= 0.65', () => {
      expect(service.decidePromotion(makeCandidate({ recurrence: 2, confidence_proposal: 0.65 }))).toBe('defer');
      expect(service.decidePromotion(makeCandidate({ recurrence: 2, confidence_proposal: 0.7 }))).toBe('defer');
    });

    it('should defer when human_review_needed is yes', () => {
      expect(service.decidePromotion(makeCandidate({
        recurrence: 10,
        confidence_proposal: 0.9,
        human_review_needed: 'yes',
      }))).toBe('defer');
    });

    it('should reject when recurrence is low', () => {
      expect(service.decidePromotion(makeCandidate({ recurrence: 1, confidence_proposal: 0.5 }))).toBe('reject');
    });

    it('should reject when confidence is too low for promotion', () => {
      expect(service.decidePromotion(makeCandidate({ recurrence: 3, confidence_proposal: 0.5 }))).toBe('reject');
    });

    it('should reject when recurrence == 2 but confidence < 0.65', () => {
      expect(service.decidePromotion(makeCandidate({ recurrence: 2, confidence_proposal: 0.6 }))).toBe('reject');
    });
  });
});
