import { Test, TestingModule } from '@nestjs/testing';
import { BootstrapService } from './bootstrap.service';
import { SurrealService } from '../database/surreal.service';
import { ok, err } from 'neverthrow';
import { DatabaseError } from '../common/types/result.types';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('BootstrapService', () => {
  let service: BootstrapService;
  let db: jest.Mocked<SurrealService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BootstrapService,
        {
          provide: SurrealService,
          useValue: {
            ping: jest.fn().mockResolvedValue(ok(true)),
            query: jest.fn().mockResolvedValue(ok([])),
            create: jest.fn().mockResolvedValue(ok({})),
            runMigration: jest.fn().mockResolvedValue(ok(undefined)),
          },
        },
      ],
    }).compile();

    service = module.get(BootstrapService);
    db = module.get(SurrealService);
  });

  describe('validate', () => {
    it('should check all 5 identity files', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('{"belief_id":"I1","content":"test","confidence":1}\n');

      const result = await service.validate('/fake/root');
      expect(result.isOk()).toBe(true);
      const report = result._unsafeUnwrap();

      const identityChecks = report.checks.filter((c) => c.name.startsWith('identity:'));
      expect(identityChecks).toHaveLength(5);
      expect(identityChecks.every((c) => c.ok)).toBe(true);
    });

    it('should fail when identity files are missing', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await service.validate('/fake/root');
      expect(result.isOk()).toBe(true);
      const report = result._unsafeUnwrap();
      expect(report.allPassed).toBe(false);
    });

    it('should check database connectivity', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('{"belief_id":"I1","content":"test","confidence":1}\n');
      db.ping.mockResolvedValue(err(new DatabaseError('unreachable')));

      const result = await service.validate('/fake/root');
      const report = result._unsafeUnwrap();
      const dbCheck = report.checks.find((c) => c.name === 'database:connectivity');
      expect(dbCheck!.ok).toBe(false);
    });

    it('should validate core.jsonl format', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('not json\n');

      const result = await service.validate('/fake/root');
      const report = result._unsafeUnwrap();
      const seedCheck = report.checks.find((c) => c.name === 'seed:core.jsonl');
      expect(seedCheck!.ok).toBe(false);
    });
  });

  describe('isSeeded', () => {
    it('should return true when beliefs exist', async () => {
      db.query.mockResolvedValue(ok([{ belief_id: 'I1' }] as any));
      const result = await service.isSeeded();
      expect(result._unsafeUnwrap()).toBe(true);
    });

    it('should return false when no beliefs', async () => {
      db.query.mockResolvedValue(ok([]));
      const result = await service.isSeeded();
      expect(result._unsafeUnwrap()).toBe(false);
    });
  });
});
