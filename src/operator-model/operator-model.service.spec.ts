import { Test, TestingModule } from '@nestjs/testing';
import { OperatorModelService } from './operator-model.service';
import { SurrealService } from '../database/surreal.service';
import { EventsService } from '../events/events.service';
import { mockEventsService } from '../__mocks__/events.mock';
import { ok } from 'neverthrow';

describe('OperatorModelService', () => {
  let service: OperatorModelService;
  let db: jest.Mocked<SurrealService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OperatorModelService,
        { provide: SurrealService, useValue: {
          query: jest.fn().mockResolvedValue(ok([])),
          create: jest.fn().mockResolvedValue(ok({ id: 'operator_model:test' })),
          update: jest.fn().mockResolvedValue(ok({})),
        }},
        { provide: EventsService, useValue: mockEventsService },
      ],
    }).compile();

    service = module.get(OperatorModelService);
    db = module.get(SurrealService);
  });

  describe('getModel', () => {
    it('should return existing model', async () => {
      db.query.mockResolvedValue(ok([{ id: 'op:1', expertise: [], trust: { operator_trust_in_agent: 0.8 } }] as any));
      const result = await service.getModel();
      expect(result.isOk()).toBe(true);
    });

    it('should create default model if none exists', async () => {
      db.query.mockResolvedValue(ok([]));
      const result = await service.getModel();
      expect(result.isOk()).toBe(true);
      expect(db.create).toHaveBeenCalledWith('operator_model', expect.objectContaining({
        expertise: [],
      }));
    });
  });

  describe('updateTrust', () => {
    it('should decrease trust on override', async () => {
      db.query.mockResolvedValue(ok([{
        id: 'op:1', expertise: [], communication: {}, session: { frustration_signals: 0 },
        patterns: {}, trust: { operator_trust_in_agent: 0.8, agent_trust_in_operator: 1.0, evidence: [] },
        updated_at: new Date().toISOString(),
      }] as any));

      await service.updateTrust(true);
      expect(db.update).toHaveBeenCalledWith('op:1', expect.objectContaining({
        trust: expect.objectContaining({ operator_trust_in_agent: expect.any(Number) }),
      }));
    });
  });

  describe('addExpertise', () => {
    it('should add new domain expertise', async () => {
      db.query.mockResolvedValue(ok([{
        id: 'op:1', expertise: [], communication: {}, session: {},
        patterns: {}, trust: { operator_trust_in_agent: 0.8, agent_trust_in_operator: 1.0, evidence: [] },
        updated_at: new Date().toISOString(),
      }] as any));

      await service.addExpertise('TypeScript', 'expert', 'builds complex TS projects');
      expect(db.update).toHaveBeenCalledWith('op:1', expect.objectContaining({
        expertise: expect.arrayContaining([expect.objectContaining({ domain: 'TypeScript', level: 'expert' })]),
      }));
    });
  });
});
