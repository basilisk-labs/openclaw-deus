import { Test, TestingModule } from '@nestjs/testing';
import { KnowledgeService } from './knowledge.service';
import { SurrealService } from '../database/surreal.service';
import { EventsService } from '../events/events.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { SimilarityProvider } from '../cognitive/similarity.provider';
import { BayesianUpdaterService } from '../cognitive/bayesian-updater.service';
import { CognitiveConfigService } from '../cognitive/cognitive-config.service';
import { mockEventsService } from '../__mocks__/events.mock';
import { mockCognitiveConfig } from '../__mocks__/cognitive-config.mock';
import { ok } from 'neverthrow';

describe('KnowledgeService', () => {
  let service: KnowledgeService;
  let db: jest.Mocked<SurrealService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeService,
        { provide: SurrealService, useValue: {
          query: jest.fn().mockResolvedValue(ok([])),
          create: jest.fn().mockResolvedValue(ok({ id: 'knowledge:test', knowledge_id: 'K001' })),
          update: jest.fn().mockResolvedValue(ok({})),
        }},
        { provide: EventsService, useValue: mockEventsService },
        { provide: EmbeddingsService, useValue: {
          embed: jest.fn().mockResolvedValue(ok(new Array(1536).fill(0))),
        }},
        { provide: SimilarityProvider, useValue: new SimilarityProvider(mockCognitiveConfig as CognitiveConfigService) },
        { provide: BayesianUpdaterService, useValue: { computePrior: jest.fn().mockReturnValue(0.4), updateWithEvidence: jest.fn().mockReturnValue({ point: 0.65, lower: 0.5, upper: 0.8 }), reinforcementBoost: jest.fn().mockReturnValue(0.03) } },
      ],
    }).compile();

    service = module.get(KnowledgeService);
    db = module.get(SurrealService);
  });

  describe('create', () => {
    it('should create knowledge with calibrated confidence', async () => {
      const result = await service.create({
        kind: 'fact',
        content: 'Project uses TypeScript with NestJS',
        domain: 'technical',
        confidence: 0.9,
        evidence: [{ source: 'observation', quality: 'explicit_statement', timestamp: new Date().toISOString(), content: 'Saw tsconfig.json' }],
      });
      expect(result.isOk()).toBe(true);
      expect(db.create).toHaveBeenCalledWith('knowledge', expect.objectContaining({
        kind: 'fact',
        domain: 'technical',
      }));
    });
  });

  describe('findById', () => {
    it('should find existing knowledge', async () => {
      db.query.mockResolvedValue(ok([{ knowledge_id: 'K001', content: 'test' }] as any));
      const result = await service.findById('K001');
      expect(result.isOk()).toBe(true);
    });

    it('should return NotFoundError for missing knowledge', async () => {
      db.query.mockResolvedValue(ok([]));
      const result = await service.findById('NOPE');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND');
    });
  });

  describe('reinforce', () => {
    it('should add evidence and boost confidence', async () => {
      db.query.mockResolvedValue(ok([{
        id: 'knowledge:test', knowledge_id: 'K001', content: 'test',
        evidence: [], confidence: { point: 0.7, lower: 0.6, upper: 0.8 },
      }] as any));

      const result = await service.reinforce('K001', {
        source: 'interaction', quality: 'strong_implication',
        timestamp: new Date().toISOString(), content: 'confirmed again',
      });
      expect(result.isOk()).toBe(true);
      expect(db.update).toHaveBeenCalled();
    });
  });
});
