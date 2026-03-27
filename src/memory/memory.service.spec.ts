import { Test, TestingModule } from '@nestjs/testing';
import { MemoryService } from './memory.service';
import { SurrealService } from '../database/surreal.service';
import { EventsService } from '../events/events.service';
import { mockEventsService } from '../__mocks__/events.mock';
import { ok } from 'neverthrow';

describe('MemoryService', () => {
  let service: MemoryService;
  let db: jest.Mocked<SurrealService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryService,
        {
          provide: SurrealService,
          useValue: {
            create: jest.fn().mockResolvedValue(ok({ id: 'activity_log:test' })),
            query: jest.fn().mockResolvedValue(ok([])),
          },
        },
        { provide: EventsService, useValue: mockEventsService },
      ],
    }).compile();

    service = module.get(MemoryService);
    db = module.get(SurrealService);
  });

  describe('logActivity', () => {
    it('should create activity log entry', async () => {
      const result = await service.logActivity({ type: 'git', description: 'Initial commit' });
      expect(result.isOk()).toBe(true);
      expect(db.create).toHaveBeenCalledWith('activity_log', expect.objectContaining({
        type: 'git',
        description: 'Initial commit',
        agent: 'DEUS',
      }));
    });

    it('should set day_key to today', async () => {
      const today = new Date().toISOString().slice(0, 10);
      await service.logActivity({ type: 'event', description: 'test' });
      expect(db.create).toHaveBeenCalledWith('activity_log', expect.objectContaining({
        day_key: today,
      }));
    });
  });

  describe('convenience methods', () => {
    it('logGit should set type to git', async () => {
      await service.logGit('commit abc');
      expect(db.create).toHaveBeenCalledWith('activity_log', expect.objectContaining({ type: 'git' }));
    });

    it('logCommand should set type to command', async () => {
      await service.logCommand('npm test');
      expect(db.create).toHaveBeenCalledWith('activity_log', expect.objectContaining({ type: 'command' }));
    });

    it('logDecision should set type to decision', async () => {
      await service.logDecision('Use NestJS', 'Better DI');
      expect(db.create).toHaveBeenCalledWith('activity_log', expect.objectContaining({
        type: 'decision',
        context: { reasoning: 'Better DI' },
      }));
    });
  });

  describe('search', () => {
    it('should pass query and limit to DB', async () => {
      await service.search('commit', 10);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('$query'),
        expect.objectContaining({ query: 'commit', limit: 10 }),
      );
    });

    it('should default limit to 20', async () => {
      await service.search('test');
      expect(db.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ limit: 20 }),
      );
    });
  });
});
