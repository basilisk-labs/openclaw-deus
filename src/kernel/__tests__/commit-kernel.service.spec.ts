import { ok, err } from 'neverthrow';
import { CommitKernelService } from '../commit/commit-kernel.service';
import { mockCognitiveConfig } from '../../__mocks__/cognitive-config.mock';
import { Signal, CommitDelta, Trace } from '../kernel.types';

// ─── Mocks ────────────────────────────────────────────────────────────

const mockDb = {
  query: jest.fn().mockResolvedValue(ok([])),
  create: jest.fn().mockResolvedValue(ok({ commit_id: 'C_mock' })),
};

const mockTraceGraph = {
  getCycle: jest.fn().mockReturnValue(0),
  ingestSignals: jest.fn().mockResolvedValue(ok(['T_1'])),
  findConvergentClusters: jest.fn().mockResolvedValue([]),
  getActiveTraces: jest.fn().mockResolvedValue(ok([])),
};

function createService(): CommitKernelService {
  return new CommitKernelService(
    mockDb as any,
    mockTraceGraph as any,
    mockCognitiveConfig as any,
  );
}

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    agent_id: 'agent-1',
    agent_rank: 1,
    type: 'perception',
    content: 'test signal',
    payload: {},
    confidence: 0.7,
    novelty_cost: 0.1,
    used_slow_path: false,
    targets: [],
    cycle: 0,
    ...overrides,
  };
}

describe('CommitKernelService', () => {
  let svc: CommitKernelService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = createService();
  });

  // ═══════════════════════════════════════════
  // getCommitCount
  // ═══════════════════════════════════════════

  describe('getCommitCount()', () => {
    it('starts at 0', () => {
      expect(svc.getCommitCount()).toBe(0);
    });

    it('increments after successful commit', async () => {
      mockTraceGraph.findConvergentClusters.mockResolvedValueOnce([
        { traces: ['T_1'], agents: ['a1', 'a2', 'a3'], convergence: 0.6, avg_urgency: 0.5 },
      ]);
      await svc.processCycle([makeSignal({ agent_id: 'a1' })]);
      expect(svc.getCommitCount()).toBe(1);
    });
  });

  // ═══════════════════════════════════════════
  // processCycle — convergent signals
  // ═══════════════════════════════════════════

  describe('processCycle() with convergent signals', () => {
    it('creates commits from convergent clusters', async () => {
      mockTraceGraph.findConvergentClusters.mockResolvedValueOnce([
        { traces: ['T_1'], agents: ['a1', 'a2'], convergence: 0.6, avg_urgency: 0.5 },
      ]);

      const result = await svc.processCycle([
        makeSignal({ agent_id: 'a1' }),
        makeSignal({ agent_id: 'a2' }),
      ]);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().length).toBe(1);
      expect(mockDb.create).toHaveBeenCalledWith('commit_log', expect.objectContaining({
        type: expect.any(String),
        source_agents: ['a1', 'a2'],
      }));
    });

    it('creates multiple commits for multiple clusters', async () => {
      mockTraceGraph.findConvergentClusters.mockResolvedValueOnce([
        { traces: ['T_1'], agents: ['a1', 'a2'], convergence: 0.6, avg_urgency: 0.5 },
        { traces: ['T_2'], agents: ['a3', 'a4'], convergence: 0.5, avg_urgency: 0.4 },
      ]);

      const result = await svc.processCycle([
        makeSignal({ agent_id: 'a1' }),
        makeSignal({ agent_id: 'a3' }),
      ]);

      expect(result._unsafeUnwrap().length).toBe(2);
    });
  });

  // ═══════════════════════════════════════════
  // processCycle — escalation signals
  // ═══════════════════════════════════════════

  describe('processCycle() with escalation signals', () => {
    it('creates escalation commit for high-confidence signal', async () => {
      const result = await svc.processCycle([
        makeSignal({ agent_id: 'a1', confidence: 0.95 }),
      ]);

      expect(result.isOk()).toBe(true);
      const commits = result._unsafeUnwrap();
      expect(commits.length).toBe(1);
      expect(commits[0].is_escalation).toBe(true);
    });

    it('does not duplicate escalation if already covered by convergent commit', async () => {
      mockTraceGraph.findConvergentClusters.mockResolvedValueOnce([
        { traces: ['T_1'], agents: ['a1'], convergence: 0.6, avg_urgency: 0.9 },
      ]);

      const result = await svc.processCycle([
        makeSignal({ agent_id: 'a1', confidence: 0.95 }),
      ]);

      // Should only have 1 commit (convergent covers the agent)
      expect(result._unsafeUnwrap().length).toBe(1);
    });

    it('escalation commit has correct type for affect signals', async () => {
      const result = await svc.processCycle([
        makeSignal({ agent_id: 'a1', confidence: 0.95, type: 'affect' }),
      ]);
      const commits = result._unsafeUnwrap();
      expect(commits[0].type).toBe('priority');
    });

    it('escalation commit has correct type for strategy signals', async () => {
      const result = await svc.processCycle([
        makeSignal({ agent_id: 'a1', confidence: 0.95, type: 'strategy' }),
      ]);
      const commits = result._unsafeUnwrap();
      expect(commits[0].type).toBe('action');
    });
  });

  // ═══════════════════════════════════════════
  // processCycle — empty signals
  // ═══════════════════════════════════════════

  describe('processCycle() with empty signals', () => {
    it('returns empty commits array', async () => {
      const result = await svc.processCycle([]);
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual([]);
    });

    it('still calls ingestSignals', async () => {
      await svc.processCycle([]);
      expect(mockTraceGraph.ingestSignals).toHaveBeenCalledWith([]);
    });
  });

  // ═══════════════════════════════════════════
  // processCycle — error handling
  // ═══════════════════════════════════════════

  describe('processCycle() error handling', () => {
    it('returns err when ingestSignals fails', async () => {
      mockTraceGraph.ingestSignals.mockResolvedValueOnce(err({ code: 'INGEST_ERROR', message: 'fail' }));
      const result = await svc.processCycle([makeSignal()]);
      expect(result.isErr()).toBe(true);
    });

    it('skips commit when applyCommit fails', async () => {
      mockTraceGraph.findConvergentClusters.mockResolvedValueOnce([
        { traces: ['T_1'], agents: ['a1', 'a2'], convergence: 0.6, avg_urgency: 0.5 },
      ]);
      mockDb.create.mockResolvedValueOnce(err({ code: 'DB_ERROR', message: 'fail' }));

      const result = await svc.processCycle([makeSignal({ agent_id: 'a1' })]);
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════
  // computeTimeSense
  // ═══════════════════════════════════════════

  describe('computeTimeSense()', () => {
    it('returns valid TimeSense structure', async () => {
      mockDb.query.mockResolvedValueOnce(ok([])); // commit_log query
      mockTraceGraph.getActiveTraces.mockResolvedValueOnce(ok([]));
      const ts = await svc.computeTimeSense();
      expect(ts).toHaveProperty('cycle');
      expect(ts).toHaveProperty('tempo');
      expect(ts).toHaveProperty('novelty_rate');
      expect(ts).toHaveProperty('prediction_error_rate');
      expect(ts).toHaveProperty('trace_decay_velocity');
      expect(ts).toHaveProperty('dilation');
      expect(ts).toHaveProperty('rhythm_phase');
    });

    it('dilation is clamped between 0.1 and 3.0', async () => {
      mockDb.query.mockResolvedValueOnce(ok([]));
      mockTraceGraph.getActiveTraces.mockResolvedValueOnce(ok([]));
      const ts = await svc.computeTimeSense();
      expect(ts.dilation).toBeGreaterThanOrEqual(0.1);
      expect(ts.dilation).toBeLessThanOrEqual(3.0);
    });

    it('rhythm_phase is resting when tempo is low', async () => {
      mockDb.query.mockResolvedValueOnce(ok([])); // no recent commits → tempo ≈ 0
      mockTraceGraph.getActiveTraces.mockResolvedValueOnce(ok([]));
      const ts = await svc.computeTimeSense();
      expect(ts.rhythm_phase).toBe('resting');
    });

    it('rhythm_phase is active when many recent commits', async () => {
      const recentCommits = Array.from({ length: 10 }, (_, i) => ({
        cycle: i, novelty_cost: 0.1, prediction_error: 0.1,
        changes: { traces_activated: ['T_1'] },
      }));
      mockDb.query.mockResolvedValueOnce(ok(recentCommits));
      mockTraceGraph.getActiveTraces.mockResolvedValueOnce(ok([]));
      mockTraceGraph.getCycle.mockReturnValueOnce(10);
      const ts = await svc.computeTimeSense();
      expect(ts.rhythm_phase).toBe('active');
    });

    it('trace_decay_velocity is 0 when no active traces', async () => {
      mockDb.query.mockResolvedValueOnce(ok([]));
      mockTraceGraph.getActiveTraces.mockResolvedValueOnce(ok([]));
      const ts = await svc.computeTimeSense();
      expect(ts.trace_decay_velocity).toBe(0);
    });
  });

  // ═══════════════════════════════════════════
  // getAttentionWindow
  // ═══════════════════════════════════════════

  describe('getAttentionWindow()', () => {
    it('queries commit_log with attention_window limit', async () => {
      mockDb.query.mockResolvedValueOnce(ok([]));
      const result = await svc.getAttentionWindow();
      expect(result.isOk()).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('commit_log'),
        expect.objectContaining({ limit: 20 }),
      );
    });
  });

  // ═══════════════════════════════════════════
  // energy computation
  // ═══════════════════════════════════════════

  describe('energy computation in commits', () => {
    it('computes energy from novelty, pred_error, urgency', async () => {
      mockTraceGraph.findConvergentClusters.mockResolvedValueOnce([
        { traces: ['T_1'], agents: ['a1', 'a2'], convergence: 0.6, avg_urgency: 0.5 },
      ]);

      const result = await svc.processCycle([
        makeSignal({ agent_id: 'a1', novelty_cost: 0.4 }),
        makeSignal({ agent_id: 'a2', novelty_cost: 0.6 }),
      ]);

      const commits = result._unsafeUnwrap();
      expect(commits.length).toBe(1);
      expect(commits[0].energy).toBeGreaterThanOrEqual(0);
      expect(typeof commits[0].energy).toBe('number');
      expect(Number.isNaN(commits[0].energy)).toBe(false);
    });

    it('energy is 0 when all inputs are 0', async () => {
      mockTraceGraph.findConvergentClusters.mockResolvedValueOnce([
        { traces: ['T_1'], agents: ['a1', 'a2'], convergence: 0.6, avg_urgency: 0 },
      ]);

      const result = await svc.processCycle([
        makeSignal({ agent_id: 'a1', novelty_cost: 0 }),
        makeSignal({ agent_id: 'a2', novelty_cost: 0 }),
      ]);

      const commits = result._unsafeUnwrap();
      expect(commits[0].energy).toBe(0);
    });
  });

  // ═══════════════════════════════════════════
  // commit type inference
  // ═══════════════════════════════════════════

  describe('commit type inference', () => {
    it('infers perceptual from perception signals', async () => {
      mockTraceGraph.findConvergentClusters.mockResolvedValueOnce([
        { traces: ['T_1'], agents: ['a1'], convergence: 0.6, avg_urgency: 0.5 },
      ]);
      const result = await svc.processCycle([
        makeSignal({ agent_id: 'a1', type: 'perception', confidence: 0.7 }),
      ]);
      expect(result._unsafeUnwrap()[0].type).toBe('perceptual');
    });

    it('infers interpretive from prediction signals', async () => {
      mockTraceGraph.findConvergentClusters.mockResolvedValueOnce([
        { traces: ['T_1'], agents: ['a1'], convergence: 0.6, avg_urgency: 0.5 },
      ]);
      const result = await svc.processCycle([
        makeSignal({ agent_id: 'a1', type: 'prediction', confidence: 0.7 }),
      ]);
      expect(result._unsafeUnwrap()[0].type).toBe('interpretive');
    });

    it('infers priority from affect signals', async () => {
      mockTraceGraph.findConvergentClusters.mockResolvedValueOnce([
        { traces: ['T_1'], agents: ['a1'], convergence: 0.6, avg_urgency: 0.5 },
      ]);
      const result = await svc.processCycle([
        makeSignal({ agent_id: 'a1', type: 'affect', confidence: 0.7 }),
      ]);
      expect(result._unsafeUnwrap()[0].type).toBe('priority');
    });

    it('infers action from strategy signals (no affect)', async () => {
      mockTraceGraph.findConvergentClusters.mockResolvedValueOnce([
        { traces: ['T_1'], agents: ['a1'], convergence: 0.6, avg_urgency: 0.5 },
      ]);
      const result = await svc.processCycle([
        makeSignal({ agent_id: 'a1', type: 'strategy', confidence: 0.7 }),
      ]);
      expect(result._unsafeUnwrap()[0].type).toBe('action');
    });

    it('infers self_model from strategy + affect combination', async () => {
      mockTraceGraph.findConvergentClusters.mockResolvedValueOnce([
        { traces: ['T_1'], agents: ['a1', 'a2'], convergence: 0.6, avg_urgency: 0.5 },
      ]);
      const result = await svc.processCycle([
        makeSignal({ agent_id: 'a1', type: 'strategy', confidence: 0.9 }),
        makeSignal({ agent_id: 'a2', type: 'affect', confidence: 0.3 }),
      ]);
      expect(result._unsafeUnwrap()[0].type).toBe('self_model');
    });
  });
});
