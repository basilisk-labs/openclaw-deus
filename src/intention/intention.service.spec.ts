import { Test, TestingModule } from '@nestjs/testing';
import { IntentionService } from './intention.service';
import { SurrealService } from '../database/surreal.service';
import { EventsService } from '../events/events.service';
import { mockEventsService } from '../__mocks__/events.mock';
import { ok } from 'neverthrow';

describe('IntentionService', () => {
  let service: IntentionService;
  let db: jest.Mocked<SurrealService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntentionService,
        { provide: SurrealService, useValue: {
          query: jest.fn().mockResolvedValue(ok([])),
          create: jest.fn().mockResolvedValue(ok({ id: 'intention:test', intention_id: 'INT001' })),
          update: jest.fn().mockResolvedValue(ok({})),
        }},
        { provide: EventsService, useValue: mockEventsService },
      ],
    }).compile();

    service = module.get(IntentionService);
    db = module.get(SurrealService);
  });

  describe('create', () => {
    it('should create intention with generated ID', async () => {
      const result = await service.create({
        description: 'Ship the auth feature',
        kind: 'goal',
        source: 'operator_explicit',
        status: 'recognized',
        children_ids: [],
        success_criteria: 'Auth working in prod',
        progress: { estimated_completion: 0, last_action: '', blockers: [] },
        recognized_at: new Date().toISOString(),
        relevant_knowledge_ids: [],
        priority: 0.8,
      });
      expect(result.isOk()).toBe(true);
      expect(db.create).toHaveBeenCalledWith('intention', expect.objectContaining({
        description: 'Ship the auth feature',
        kind: 'goal',
      }));
    });
  });

  describe('findActive', () => {
    it('should query for active statuses', async () => {
      db.query.mockResolvedValue(ok([
        { intention_id: 'INT001', status: 'active', priority: 0.9 },
        { intention_id: 'INT002', status: 'adopted', priority: 0.5 },
      ] as any));
      const result = await service.findActive();
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toHaveLength(2);
    });
  });

  describe('transition', () => {
    it('should transition status and record audit', async () => {
      db.query.mockResolvedValue(ok([{ id: 'intention:test', intention_id: 'INT001', status: 'active' }] as any));
      const result = await service.transition('INT001', 'completed', 'Task done', 'operator');
      expect(result.isOk()).toBe(true);
      expect(db.create).toHaveBeenCalledWith('intention_transition', expect.objectContaining({
        from_status: 'active',
        to_status: 'completed',
      }));
    });

    it('should return error for non-existent intention', async () => {
      db.query.mockResolvedValue(ok([]));
      const result = await service.transition('NONEXISTENT', 'completed', 'done', 'operator');
      expect(result.isErr()).toBe(true);
    });
  });

  describe('count', () => {
    it('should count all intentions', async () => {
      db.query.mockResolvedValue(ok([{ count: 5 }]));
      const result = await service.count();
      expect(result._unsafeUnwrap()).toBe(5);
    });
  });
});
