import { SubstrateBridgeService } from '../substrate-bridge.service';
import { CommitDelta } from '../kernel.types';

function makeCommit(overrides: Partial<CommitDelta> = {}): CommitDelta {
  return {
    commit_id: 'c1',
    cycle: 1,
    type: 'perceptual',
    source_agents: ['a1'],
    convergence_score: 0.5,
    is_escalation: false,
    changes: { traces_activated: [], traces_suppressed: [], traces_created: [] },
    novelty_cost: 0.1,
    prediction_error: 0.2,
    maturity: 0.5,
    urgency: 0.3,
    energy: 0.05,
    ...overrides,
  };
}

// Helpers to create neverthrow-compatible mock results
const okResult = (value: any) => ({ isOk: () => true, isErr: () => false, value });
const errResult = () => ({ isOk: () => false, isErr: () => true, value: [] });

describe('SubstrateBridgeService', () => {
  let svc: SubstrateBridgeService;
  let mockDb: any;
  let mockTraceGraph: any;
  let mockWorldModel: any;

  beforeEach(() => {
    mockDb = {
      query: jest.fn().mockResolvedValue(okResult([])),
      create: jest.fn().mockResolvedValue(okResult({})),
    };
    mockTraceGraph = {
      createTrace: jest.fn().mockResolvedValue(okResult({ trace_id: 't1' })),
      reinforceFromOutcome: jest.fn().mockResolvedValue(undefined),
    };
    mockWorldModel = {
      build: jest.fn().mockResolvedValue(okResult({ confidence: 0.8 })),
    };
    svc = new SubstrateBridgeService(mockDb, mockTraceGraph, mockWorldModel);
  });

  // --- syncSubstrateToTraces ---
  describe('syncSubstrateToTraces()', () => {
    it('creates traces from new knowledge', async () => {
      // First query (knowledge) returns records, rest return empty
      mockDb.query
        .mockResolvedValueOnce(okResult([
          { knowledge_id: 'k1', content: 'TypeScript is typed', confidence: 0.8, domain: 'tech' },
        ]))
        .mockResolvedValueOnce(okResult([]))  // intentions
        .mockResolvedValueOnce(okResult([])); // episodes

      const result = await svc.syncSubstrateToTraces(1);
      expect(result.synced).toBe(1);
      expect(mockTraceGraph.createTrace).toHaveBeenCalledWith(
        expect.objectContaining({
          source_type: 'knowledge',
          source_id: 'k1',
        }),
      );
    });

    it('skips already-synced records (empty DB results)', async () => {
      // All queries return empty → nothing to sync
      const result = await svc.syncSubstrateToTraces(1);
      expect(result.synced).toBe(0);
      expect(mockTraceGraph.createTrace).not.toHaveBeenCalled();
    });
  });

  // --- applyCommitsToWorldModel ---
  describe('applyCommitsToWorldModel()', () => {
    it('rebuilds when self_model commits present', async () => {
      await svc.applyCommitsToWorldModel([
        makeCommit({ type: 'self_model' }),
      ]);
      expect(mockWorldModel.build).toHaveBeenCalled();
    });

    it('skips rebuild when no significant commits', async () => {
      // Single low-energy non-self-model commit
      await svc.applyCommitsToWorldModel([
        makeCommit({ type: 'perceptual', energy: 0.01 }),
      ]);
      expect(mockWorldModel.build).not.toHaveBeenCalled();
    });

    it('rebuilds when total energy > 0.5', async () => {
      await svc.applyCommitsToWorldModel([
        makeCommit({ energy: 0.3 }),
        makeCommit({ energy: 0.3 }),
      ]);
      expect(mockWorldModel.build).toHaveBeenCalled();
    });

    it('does nothing for empty commits array', async () => {
      await svc.applyCommitsToWorldModel([]);
      expect(mockWorldModel.build).not.toHaveBeenCalled();
    });
  });

  // --- reinforceFromEpisode ---
  describe('reinforceFromEpisode()', () => {
    it('calls traceGraph.reinforceFromOutcome with +0.3 for success', async () => {
      mockDb.query
        .mockResolvedValueOnce(okResult([{ intention_id: 'int1' }]))  // episode query
        .mockResolvedValueOnce(okResult([{ trace_id: 't1' }, { trace_id: 't2' }])); // traces query

      await svc.reinforceFromEpisode('ep1', 'success');
      expect(mockTraceGraph.reinforceFromOutcome).toHaveBeenCalledWith(
        ['t1', 't2'],
        0.3,
      );
    });

    it('calls traceGraph.reinforceFromOutcome with -0.3 for failure', async () => {
      mockDb.query
        .mockResolvedValueOnce(okResult([{ intention_id: 'int1' }]))
        .mockResolvedValueOnce(okResult([{ trace_id: 't1' }]));

      await svc.reinforceFromEpisode('ep1', 'failure');
      expect(mockTraceGraph.reinforceFromOutcome).toHaveBeenCalledWith(
        ['t1'],
        -0.3,
      );
    });

    it('does nothing when episode not found', async () => {
      mockDb.query.mockResolvedValueOnce(errResult());
      await svc.reinforceFromEpisode('missing', 'success');
      expect(mockTraceGraph.reinforceFromOutcome).not.toHaveBeenCalled();
    });

    it('does nothing when no traces linked to intention', async () => {
      mockDb.query
        .mockResolvedValueOnce(okResult([{ intention_id: 'int1' }]))
        .mockResolvedValueOnce(okResult([])); // no traces
      await svc.reinforceFromEpisode('ep1', 'success');
      expect(mockTraceGraph.reinforceFromOutcome).not.toHaveBeenCalled();
    });
  });
});
