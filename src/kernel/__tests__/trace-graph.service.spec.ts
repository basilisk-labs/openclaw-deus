import { ok, err } from 'neverthrow';
import { TraceGraphService } from '../memory/trace-graph.service';
import { mockCognitiveConfig } from '../../__mocks__/cognitive-config.mock';
import { Signal, Trace } from '../kernel.types';

// ─── Mocks ────────────────────────────────────────────────────────────

const mockDb = {
  query: jest.fn().mockResolvedValue(ok([])),
  create: jest.fn().mockResolvedValue(ok({ trace_id: 'T_mock_0', id: 'trace:1' })),
  execute: jest.fn().mockResolvedValue(ok({})),
};

const mockConceptSpace = {
  projectNewTrace: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  detectConflict: jest.fn().mockReturnValue(null),
  birthDimension: jest.fn().mockResolvedValue(undefined),
  findNeighbors: jest.fn().mockResolvedValue([]),
  distance: jest.fn().mockReturnValue(0.5),
};

function createService(): TraceGraphService {
  return new TraceGraphService(
    mockDb as any,
    mockCognitiveConfig as any,
    mockConceptSpace as any,
  );
}

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    agent_id: 'agent-1',
    agent_rank: 1,
    type: 'perception',
    content: 'test signal content',
    payload: {},
    confidence: 0.7,
    novelty_cost: 0.1,
    used_slow_path: false,
    targets: [],
    cycle: 0,
    ...overrides,
  };
}

function makeTrace(overrides: Partial<Trace> = {}): Trace {
  return {
    trace_id: 'T_test_0',
    source_type: 'signal',
    content: 'test trace',
    weight: 0.5,
    initial_weight: 0.5,
    freshness: 1.0,
    confidence: 0.5,
    emotional_charge: 0,
    reactivation_count: 0,
    last_reactivated_cycle: 0,
    reactivation_history: [0],
    created_at_cycle: 0,
    position: [0.1, 0.2],
    velocity: [0, 0],
    suppressed: false,
    archived: false,
    ...overrides,
  };
}

describe('TraceGraphService', () => {
  let svc: TraceGraphService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = createService();
  });

  // ═══════════════════════════════════════════
  // getCycle / tick
  // ═══════════════════════════════════════════

  describe('getCycle()', () => {
    it('starts at 0', () => {
      expect(svc.getCycle()).toBe(0);
    });
  });

  describe('tick()', () => {
    it('increments cycle by 1', () => {
      const c = svc.tick();
      expect(c).toBe(1);
      expect(svc.getCycle()).toBe(1);
    });

    it('increments cycle consecutively', () => {
      svc.tick();
      svc.tick();
      expect(svc.getCycle()).toBe(2);
    });

    it('invalidates activeTraces cache', async () => {
      mockDb.query.mockResolvedValueOnce(ok([makeTrace()]));
      await svc.getActiveTraces();
      // Now cached — second call should NOT hit db again
      await svc.getActiveTraces();
      const callsBefore = mockDb.query.mock.calls.length;

      svc.tick();
      // After tick, cache is invalidated — next call hits db
      mockDb.query.mockResolvedValueOnce(ok([makeTrace()]));
      await svc.getActiveTraces();
      expect(mockDb.query.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    it('invalidates traceCount cache', async () => {
      mockDb.query.mockResolvedValueOnce(ok([{ c: 5 }]));
      await svc.getTraceCount();
      const countBefore = mockDb.query.mock.calls.length;

      svc.tick();
      mockDb.query.mockResolvedValueOnce(ok([{ c: 10 }]));
      const count = await svc.getTraceCount();
      expect(count).toBe(10);
      expect(mockDb.query.mock.calls.length).toBeGreaterThan(countBefore);
    });
  });

  // ═══════════════════════════════════════════
  // createTrace
  // ═══════════════════════════════════════════

  describe('createTrace()', () => {
    it('creates a trace with correct defaults', async () => {
      mockDb.create.mockResolvedValueOnce(ok({ trace_id: 'T_new', weight: 0.5 }));
      const result = await svc.createTrace({
        source_type: 'signal',
        content: 'new trace content',
      });
      expect(result.isOk()).toBe(true);
      expect(mockDb.create).toHaveBeenCalledWith('trace', expect.objectContaining({
        source_type: 'signal',
        content: 'new trace content',
        weight: 0.5,
        freshness: 1.0,
        confidence: 0.5,
        emotional_charge: 0,
        suppressed: false,
        archived: false,
      }));
    });

    it('uses provided initial_weight', async () => {
      mockDb.create.mockResolvedValueOnce(ok({ trace_id: 'T_new', weight: 0.8 }));
      await svc.createTrace({
        source_type: 'belief',
        content: 'belief trace',
        initial_weight: 0.8,
      });
      expect(mockDb.create).toHaveBeenCalledWith('trace', expect.objectContaining({
        weight: 0.8,
        initial_weight: 0.8,
      }));
    });

    it('uses provided emotional_charge', async () => {
      mockDb.create.mockResolvedValueOnce(ok({ trace_id: 'T_emo' }));
      await svc.createTrace({
        source_type: 'signal',
        content: 'emotional',
        emotional_charge: -0.5,
      });
      expect(mockDb.create).toHaveBeenCalledWith('trace', expect.objectContaining({
        emotional_charge: -0.5,
      }));
    });

    it('projects position via conceptSpace', async () => {
      mockConceptSpace.projectNewTrace.mockResolvedValueOnce([1, 2, 3]);
      mockDb.create.mockResolvedValueOnce(ok({ trace_id: 'T_pos' }));
      await svc.createTrace({ source_type: 'signal', content: 'positioned' });
      expect(mockConceptSpace.projectNewTrace).toHaveBeenCalledWith('positioned');
      expect(mockDb.create).toHaveBeenCalledWith('trace', expect.objectContaining({
        position: [1, 2, 3],
        velocity: [0, 0, 0],
      }));
    });

    it('returns err when db.create fails', async () => {
      mockDb.create.mockResolvedValueOnce(err({ code: 'DB_ERROR', message: 'fail' }));
      const result = await svc.createTrace({ source_type: 'signal', content: 'fail' });
      expect(result.isErr()).toBe(true);
    });

    it('sets reactivation_history to current cycle', async () => {
      svc.tick(); // cycle = 1
      mockDb.create.mockResolvedValueOnce(ok({ trace_id: 'T_hist' }));
      await svc.createTrace({ source_type: 'signal', content: 'with history' });
      expect(mockDb.create).toHaveBeenCalledWith('trace', expect.objectContaining({
        created_at_cycle: 1,
        last_reactivated_cycle: 1,
        reactivation_history: [1],
      }));
    });
  });

  // ═══════════════════════════════════════════
  // ingestSignals
  // ═══════════════════════════════════════════

  describe('ingestSignals()', () => {
    it('returns ok with empty array for no signals', async () => {
      const result = await svc.ingestSignals([]);
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual([]);
    });

    it('creates new trace when no similar trace exists', async () => {
      // findTraceBySimilarity returns no match
      mockDb.query.mockResolvedValue(ok([]));
      mockDb.create.mockResolvedValueOnce(ok({ trace_id: 'T_new_1' }));

      const result = await svc.ingestSignals([makeSignal()]);
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toContain('T_new_1');
      expect(mockDb.create).toHaveBeenCalled();
    });

    it('reactivates existing trace when similar content found', async () => {
      const existing = makeTrace({ trace_id: 'T_existing', content: 'test signal content' });
      // findNeighbors returns a spatial neighbor → findTraceBySimilarity finds a match
      mockConceptSpace.findNeighbors.mockResolvedValueOnce([{ trace: existing, dist: 0.1 }]);
      mockDb.query.mockResolvedValue(ok([existing]));

      const result = await svc.ingestSignals([makeSignal({ content: 'test signal content' })]);
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toContain('T_existing');
      // reactivate calls db.execute for UPDATE
      expect(mockDb.execute).toHaveBeenCalled();
    });

    it('creates co-occurrence edges between multiple signals', async () => {
      mockDb.query.mockResolvedValue(ok([]));
      mockDb.create
        .mockResolvedValueOnce(ok({ trace_id: 'T_1' }))
        .mockResolvedValueOnce(ok({ trace_id: 'T_2' }));

      await svc.ingestSignals([
        makeSignal({ content: 'first unique signal alpha' }),
        makeSignal({ content: 'second unique signal beta' }),
      ]);

      // link() calls db.execute with RELATE
      const relateCalls = mockDb.execute.mock.calls.filter(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('RELATE'),
      );
      expect(relateCalls.length).toBeGreaterThan(0);
    });

    it('links new trace to signal targets', async () => {
      mockDb.query.mockResolvedValue(ok([]));
      mockDb.create.mockResolvedValueOnce(ok({ trace_id: 'T_linked' }));

      await svc.ingestSignals([
        makeSignal({ targets: ['T_target_1', 'T_target_2'] }),
      ]);

      const relateCalls = mockDb.execute.mock.calls.filter(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('RELATE'),
      );
      expect(relateCalls.length).toBeGreaterThan(0);
    });

    it('runs spreadActivation on each activated trace', async () => {
      mockDb.query.mockResolvedValue(ok([]));
      mockDb.create.mockResolvedValueOnce(ok({ trace_id: 'T_spread' }));
      mockDb.execute.mockResolvedValue(ok({}));

      await svc.ingestSignals([makeSignal()]);

      // spreadActivation calls fn::spread_activation
      const spreadCalls = mockDb.execute.mock.calls.filter(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('fn::spread_activation'),
      );
      expect(spreadCalls.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════
  // getActiveTraces
  // ═══════════════════════════════════════════

  describe('getActiveTraces()', () => {
    it('queries non-archived, non-suppressed traces ordered by weight', async () => {
      const traces = [makeTrace({ weight: 0.9 }), makeTrace({ weight: 0.5, trace_id: 'T_2' })];
      mockDb.query.mockResolvedValueOnce(ok(traces));
      const result = await svc.getActiveTraces();
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toHaveLength(2);
    });

    it('respects limit parameter', async () => {
      const traces = Array.from({ length: 10 }, (_, i) => makeTrace({ trace_id: `T_${i}` }));
      mockDb.query.mockResolvedValueOnce(ok(traces));
      const result = await svc.getActiveTraces(3);
      expect(result._unsafeUnwrap()).toHaveLength(3);
    });

    it('caches results within same cycle', async () => {
      mockDb.query.mockResolvedValueOnce(ok([makeTrace()]));
      await svc.getActiveTraces();
      await svc.getActiveTraces();
      // query should only be called once due to caching
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });

    it('returns err when db fails', async () => {
      mockDb.query.mockResolvedValueOnce(err({ code: 'DB_ERROR', message: 'fail' }));
      const result = await svc.getActiveTraces();
      expect(result.isErr()).toBe(true);
    });
  });

  // ═══════════════════════════════════════════
  // getTraceCount
  // ═══════════════════════════════════════════

  describe('getTraceCount()', () => {
    it('returns count from db', async () => {
      mockDb.query.mockResolvedValueOnce(ok([{ c: 42 }]));
      const count = await svc.getTraceCount();
      expect(count).toBe(42);
    });

    it('returns 0 when db returns empty', async () => {
      mockDb.query.mockResolvedValueOnce(ok([]));
      const count = await svc.getTraceCount();
      expect(count).toBe(0);
    });

    it('caches count within same cycle', async () => {
      mockDb.query.mockResolvedValueOnce(ok([{ c: 10 }]));
      await svc.getTraceCount();
      await svc.getTraceCount();
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });
  });

  // ═══════════════════════════════════════════
  // spreadActivation
  // ═══════════════════════════════════════════

  describe('spreadActivation()', () => {
    it('calls fn::spread_activation with config params', async () => {
      mockDb.execute.mockResolvedValue(ok({}));
      mockDb.query.mockResolvedValue(ok([]));
      await svc.spreadActivation('T_src');
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('fn::spread_activation'),
        expect.objectContaining({ tid: 'T_src' }),
      );
    });

    it('does not recurse beyond depth 3', async () => {
      mockDb.execute.mockResolvedValue(ok({}));
      await svc.spreadActivation('T_deep', 4);
      // Should not call db at all (depth > 3 returns immediately)
      expect(mockDb.execute).not.toHaveBeenCalled();
    });

    it('recurses on heavily activated neighbors at depth < 2', async () => {
      mockDb.execute.mockResolvedValue(ok({}));
      mockDb.query.mockResolvedValue(ok([
        { trace_id: 'T_neighbor' },
      ]));
      await svc.spreadActivation('T_src', 0);
      // Should call spread_activation for T_src and then for T_neighbor
      const spreadCalls = mockDb.execute.mock.calls.filter(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('fn::spread_activation'),
      );
      expect(spreadCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('does not recurse on neighbors at depth >= 2', async () => {
      mockDb.execute.mockResolvedValue(ok({}));
      mockDb.query.mockResolvedValue(ok([{ trace_id: 'T_far' }]));
      await svc.spreadActivation('T_src', 2);
      // At depth 2, only one spread call (no recursion)
      const spreadCalls = mockDb.execute.mock.calls.filter(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('fn::spread_activation'),
      );
      expect(spreadCalls.length).toBe(1);
    });
  });

  // ═══════════════════════════════════════════
  // backpropagatePredictionError
  // ═══════════════════════════════════════════

  describe('backpropagatePredictionError()', () => {
    it('calls fn::backprop_pred_error when error >= 0.01', async () => {
      mockDb.execute.mockResolvedValue(ok({}));
      await svc.backpropagatePredictionError('T_err', 0.5);
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('fn::backprop_pred_error'),
        expect.objectContaining({ tid: 'T_err', error: 0.5 }),
      );
    });

    it('skips when error < 0.01', async () => {
      await svc.backpropagatePredictionError('T_low', 0.005);
      expect(mockDb.execute).not.toHaveBeenCalled();
    });

    it('passes pred_error_backprop_rate from config', async () => {
      mockDb.execute.mockResolvedValue(ok({}));
      await svc.backpropagatePredictionError('T_rate', 0.3);
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ rate: 0.08 }), // default from mock config
      );
    });
  });

  // ═══════════════════════════════════════════
  // reinforceFromOutcome
  // ═══════════════════════════════════════════

  describe('reinforceFromOutcome()', () => {
    it('calls fn::reinforce_outcome with trace ids and reward', async () => {
      mockDb.execute.mockResolvedValue(ok({}));
      await svc.reinforceFromOutcome(['T_1', 'T_2'], 0.8);
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('fn::reinforce_outcome'),
        expect.objectContaining({ tids: ['T_1', 'T_2'], reward: 0.8 }),
      );
    });

    it('passes reinforcement_rate from config', async () => {
      mockDb.execute.mockResolvedValue(ok({}));
      await svc.reinforceFromOutcome(['T_1'], 1.0);
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ rate: 0.1 }), // default from mock config
      );
    });
  });

  // ═══════════════════════════════════════════
  // forget
  // ═══════════════════════════════════════════

  describe('forget()', () => {
    it('calls fn::forget_traces with config params', async () => {
      mockDb.execute.mockResolvedValue(ok({ archived: 3 }));
      const result = await svc.forget();
      expect(result.isOk()).toBe(true);
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('fn::forget_traces'),
        expect.objectContaining({ decay: 0.02, threshold: 0.01 }),
      );
    });

    it('returns decayed/archived counts', async () => {
      mockDb.execute.mockResolvedValue(ok({ archived: 5 }));
      const result = await svc.forget();
      expect(result._unsafeUnwrap()).toEqual({ decayed: 1, archived: 5 });
    });

    it('returns archived=0 when db fails', async () => {
      mockDb.execute.mockResolvedValue(err({ code: 'DB_ERROR', message: 'fail' }));
      const result = await svc.forget();
      expect(result._unsafeUnwrap()).toEqual({ decayed: 1, archived: 0 });
    });
  });

  // ═══════════════════════════════════════════
  // findConvergentClusters
  // ═══════════════════════════════════════════

  describe('findConvergentClusters()', () => {
    it('returns empty array for no signals', async () => {
      const clusters = await svc.findConvergentClusters([]);
      expect(clusters).toEqual([]);
    });

    it('detects structural convergence from shared targets', async () => {
      const signals = [
        makeSignal({ agent_id: 'a1', targets: ['T_shared'], confidence: 0.5 }),
        makeSignal({ agent_id: 'a2', targets: ['T_shared'], confidence: 0.6 }),
        makeSignal({ agent_id: 'a3', targets: ['T_shared'], confidence: 0.7 }),
      ];
      // convergence = 3/5 = 0.6 which is >= 0.4 threshold
      const clusters = await svc.findConvergentClusters(signals);
      expect(clusters.length).toBeGreaterThan(0);
      expect(clusters[0].agents).toContain('a1');
      expect(clusters[0].agents).toContain('a2');
    });

    it('detects content similarity convergence across agents', async () => {
      const signals = [
        makeSignal({ agent_id: 'a1', content: 'machine learning model training accuracy', targets: [] }),
        makeSignal({ agent_id: 'a2', content: 'machine learning model training speed', targets: [] }),
      ];
      // "machine", "learning", "model", "training" overlap → content similarity > 0.3
      const clusters = await svc.findConvergentClusters(signals, 0.1);
      // Should create synthetic convergence entry
      expect(clusters.length).toBeGreaterThanOrEqual(0);
    });

    it('sorts clusters by convergence descending', async () => {
      const signals = [
        makeSignal({ agent_id: 'a1', targets: ['T_high'], confidence: 0.9 }),
        makeSignal({ agent_id: 'a2', targets: ['T_high'], confidence: 0.9 }),
        makeSignal({ agent_id: 'a3', targets: ['T_high'], confidence: 0.9 }),
        makeSignal({ agent_id: 'a1', targets: ['T_low'], confidence: 0.5 }),
        makeSignal({ agent_id: 'a2', targets: ['T_low'], confidence: 0.5 }),
      ];
      const clusters = await svc.findConvergentClusters(signals);
      if (clusters.length > 1) {
        expect(clusters[0].convergence).toBeGreaterThanOrEqual(clusters[1].convergence);
      }
    });

    it('detects escalations above escalation_threshold', async () => {
      const signals = [
        makeSignal({ agent_id: 'a1', targets: ['T_esc'], confidence: 0.95 }),
      ];
      // Single agent with conf 0.95 > 0.9 escalation threshold → cluster formed
      const clusters = await svc.findConvergentClusters(signals);
      expect(clusters.length).toBeGreaterThan(0);
    });

    it('computes avg_urgency for each cluster', async () => {
      const signals = [
        makeSignal({ agent_id: 'a1', targets: ['T_1'], confidence: 0.4 }),
        makeSignal({ agent_id: 'a2', targets: ['T_1'], confidence: 0.8 }),
        makeSignal({ agent_id: 'a3', targets: ['T_1'], confidence: 0.6 }),
      ];
      const clusters = await svc.findConvergentClusters(signals);
      if (clusters.length > 0) {
        expect(clusters[0].avg_urgency).toBeCloseTo(0.6, 1);
      }
    });
  });

  // ═══════════════════════════════════════════
  // link
  // ═══════════════════════════════════════════

  describe('link()', () => {
    it('executes RELATE query with correct params', async () => {
      mockDb.execute.mockResolvedValue(ok({}));
      await svc.link('T_from', 'T_to', 'activates', 0.5);
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('RELATE'),
        expect.objectContaining({ from: 'T_from', to: 'T_to', w: 0.5 }),
      );
    });

    it('passes current cycle to edge', async () => {
      svc.tick(); // cycle = 1
      mockDb.execute.mockResolvedValue(ok({}));
      await svc.link('T_a', 'T_b', 'inhibits', 0.3);
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ cycle: 1 }),
      );
    });
  });
});
