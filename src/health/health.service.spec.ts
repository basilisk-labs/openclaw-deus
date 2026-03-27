import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';
import { SurrealService } from '../database/surreal.service';
import { BeliefsService } from '../beliefs/beliefs.service';
import { MemoryService } from '../memory/memory.service';
import { ok, err } from 'neverthrow';
import { DatabaseError } from '../common/types/result.types';

describe('HealthService', () => {
  let service: HealthService;
  let db: jest.Mocked<SurrealService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: SurrealService,
          useValue: {
            ping: jest.fn().mockResolvedValue(ok(true)),
            query: jest.fn().mockResolvedValue(ok([])),
          },
        },
        {
          provide: BeliefsService,
          useValue: {
            count: jest.fn().mockResolvedValue(ok(10)),
            findByStatus: jest.fn().mockResolvedValue(ok([{}, {}, {}])),
          },
        },
        {
          provide: MemoryService,
          useValue: {
            getRecentEntries: jest.fn().mockResolvedValue(ok([{ day_key: '2026-03-25' }])),
          },
        },
      ],
    }).compile();

    service = module.get(HealthService);
    db = module.get(SurrealService);
  });

  it('should return healthy when everything works', async () => {
    const result = await service.getHealth();
    expect(result.isOk()).toBe(true);
    const health = result._unsafeUnwrap();
    expect(health.status).toBe('healthy');
    expect(health.database.connected).toBe(true);
    expect(health.beliefs.count).toBe(10);
    expect(health.beliefs.active).toBe(3);
  });

  it('should return unhealthy when DB is down', async () => {
    db.ping.mockResolvedValue(err(new DatabaseError('fail')));
    const result = await service.getHealth();
    const health = result._unsafeUnwrap();
    expect(health.status).toBe('unhealthy');
    expect(health.database.connected).toBe(false);
  });

  it('should return degraded when no beliefs', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: SurrealService, useValue: { ping: jest.fn().mockResolvedValue(ok(true)), query: jest.fn().mockResolvedValue(ok([])) } },
        { provide: BeliefsService, useValue: { count: jest.fn().mockResolvedValue(ok(0)), findByStatus: jest.fn().mockResolvedValue(ok([])) } },
        { provide: MemoryService, useValue: { getRecentEntries: jest.fn().mockResolvedValue(ok([])) } },
      ],
    }).compile();

    const svc = module.get(HealthService);
    const result = await svc.getHealth();
    expect(result._unsafeUnwrap().status).toBe('degraded');
  });
});
