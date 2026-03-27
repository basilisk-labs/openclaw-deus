import { Test, TestingModule } from '@nestjs/testing';
import { BeliefsService } from './beliefs.service';
import { SurrealService } from '../database/surreal.service';
import { ok } from 'neverthrow';
import { Belief } from '../common/types/belief.types';
import { EventsService } from '../events/events.service';
import { BeliefEventsService } from '../events/belief-events.service';
import { mockEventsService, mockBeliefEventsService } from '../__mocks__/events.mock';

const mockBelief: Belief = {
  id: 'belief:test1',
  belief_id: 'B1',
  content: 'Test belief content',
  confidence: 0.8,
  evidence_set: ['test'],
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
};

describe('BeliefsService', () => {
  let service: BeliefsService;
  let db: jest.Mocked<SurrealService>;

  beforeEach(async () => {
    const mockDb = {
      query: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BeliefsService,
        { provide: SurrealService, useValue: mockDb },
        { provide: EventsService, useValue: mockEventsService },
        { provide: BeliefEventsService, useValue: mockBeliefEventsService },
      ],
    }).compile();

    service = module.get(BeliefsService);
    db = module.get(SurrealService);
  });

  describe('findAll', () => {
    it('should return all beliefs without filters', async () => {
      db.query.mockResolvedValue(ok([mockBelief]));
      const result = await service.findAll();
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toHaveLength(1);
    });

    it('should filter by class', async () => {
      db.query.mockResolvedValue(ok([mockBelief]));
      const query = Object.assign(new (await import('../common/types/pagination.types')).PaginationDto(), { class: 'operational' as const });
      const result = await service.findAll(query as any);
      expect(result.isOk()).toBe(true);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('belief_class = $class'),
        expect.objectContaining({ class: 'operational' }),
      );
    });

    it('should filter by status', async () => {
      db.query.mockResolvedValue(ok([]));
      const query = Object.assign(new (await import('../common/types/pagination.types')).PaginationDto(), { status: 'archived' as const });
      await service.findAll(query as any);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('status = $status'),
        expect.objectContaining({ status: 'archived' }),
      );
    });
  });

  describe('findById', () => {
    it('should return belief when found', async () => {
      db.query.mockResolvedValue(ok([mockBelief]));
      const result = await service.findById('B1');
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().belief_id).toBe('B1');
    });

    it('should return NotFoundError when not found', async () => {
      db.query.mockResolvedValue(ok([]));
      const result = await service.findById('NONEXISTENT');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('NOT_FOUND');
    });
  });

  describe('generateId', () => {
    it('should generate next sequential ID', () => {
      const beliefs = [
        { ...mockBelief, belief_id: 'B1' },
        { ...mockBelief, belief_id: 'B3' },
      ];
      expect(service.generateId(beliefs, 'B')).toBe('B4');
    });

    it('should start at 1 for empty list', () => {
      expect(service.generateId([], 'B')).toBe('B1');
    });

    it('should handle different prefixes', () => {
      const beliefs = [{ ...mockBelief, belief_id: 'I1' }];
      expect(service.generateId(beliefs, 'I')).toBe('I2');
      expect(service.generateId(beliefs, 'B')).toBe('B1');
    });
  });

  describe('count', () => {
    it('should return belief count', async () => {
      db.query.mockResolvedValue(ok([{ count: 42 }]));
      const result = await service.count();
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(42);
    });

    it('should return 0 for empty result', async () => {
      db.query.mockResolvedValue(ok([]));
      const result = await service.count();
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(0);
    });
  });
});
