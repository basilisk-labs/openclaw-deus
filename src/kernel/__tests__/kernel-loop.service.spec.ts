import { KernelLoopService, CognitiveAgent, AgentContext } from '../kernel-loop.service';
import { TraceGraphService } from '../memory/trace-graph.service';
import { CommitKernelService } from '../commit/commit-kernel.service';
import { AffectiveStateService } from '../affect/affective-state.service';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';
import { Signal, CommitDelta, TimeSense } from '../kernel.types';
import { ok } from 'neverthrow';
import { mockCognitiveConfig } from '../../__mocks__/cognitive-config.mock';

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    agent_id: 'test', agent_rank: 1, type: 'perception',
    content: 'test signal', payload: {},
    confidence: 0.5, novelty_cost: 0.3, used_slow_path: false,
    targets: ['T1'], cycle: 0, ...overrides,
  };
}

function makeCommit(overrides: Partial<CommitDelta> = {}): CommitDelta {
  return {
    commit_id: 'C1', cycle: 0, type: 'perceptual',
    source_agents: ['test'], convergence_score: 0.5, is_escalation: false,
    changes: { traces_activated: [], traces_suppressed: [], traces_created: [] },
    novelty_cost: 0.3, prediction_error: 0.1, maturity: 0.5, urgency: 0.3,
    energy: 0.2, ...overrides,
  };
}

const mockTimeSense: TimeSense = {
  cycle: 1, tempo: 0.5, novelty_rate: 0.3, prediction_error_rate: 0.1,
  trace_decay_velocity: 0.02, dilation: 1.0, rhythm_phase: 'active',
};

describe('KernelLoopService', () => {
  let service: KernelLoopService;

  beforeEach(() => {
    const mockTraceGraph = {
      tick: jest.fn().mockReturnValue(1),
      getCycle: jest.fn().mockReturnValue(1),
      getActiveTraces: jest.fn().mockResolvedValue(ok([])),
      ingestSignals: jest.fn().mockResolvedValue(ok([])),
      findConvergentClusters: jest.fn().mockResolvedValue([]),
      forget: jest.fn().mockResolvedValue(ok({ decayed: 0, archived: 0 })),
    };

    const mockCommitKernel = {
      processCycle: jest.fn().mockResolvedValue(ok([])),
      computeTimeSense: jest.fn().mockResolvedValue(mockTimeSense),
    };

    const mockAffect = {
      processCommits: jest.fn().mockReturnValue({ configDeltas: new Map() }),
      getSnapshot: jest.fn().mockReturnValue({
        hormones: { cortisol: 0.2, dopamine: 0.3, norepinephrine: 0.2, serotonin: 0.5 },
        pain: { intensity: 0, source: 'none', chronic: false, accumulator: 0, cycles_unresolved: 0 },
        valence: 0, arousal: 0.2, mode: 'exploit', mode_probabilities: [0.1, 0.6, 0.2, 0.1], loss: 0,
      }),
    };

    service = Object.create(KernelLoopService.prototype);
    (service as any).traceGraph = mockTraceGraph;
    (service as any).commitKernel = mockCommitKernel;
    (service as any).config = mockCognitiveConfig;
    (service as any).affect = mockAffect;
    (service as any).agents = [];
    (service as any).llmCallsUsed = 0;
    (service as any).allCommits = [];
    (service as any).phenomenalState = null;
    (service as any).guard = { consecutive_self_model_commits: 0, uncertainty_trend: [], orthogonal_signal_deficit: 0 };
    (service as any).eventQueue = [];
    (service as any).pendingResolvers = [];
    (service as any).eventIdCounter = 0;
    (service as any).processing = false;
    (service as any).running = false;
    (service as any).loopHandle = null;
    (service as any).energy = {
      tick: jest.fn(),
      spend: jest.fn().mockReturnValue(true),
      canAffordLlm: jest.fn().mockReturnValue(true),
      canAffordExploration: jest.fn().mockReturnValue(true),
      needsSleep: jest.fn().mockReturnValue(false),
      attentionFactor: jest.fn().mockReturnValue(1.0),
      sleep: jest.fn().mockReturnValue({ slept: true, cycles_awake: 10 }),
      cost: { llm_call: 0.08, trace_create: 0.005, reflection_cycle: 0.01, commit: 0.005 },
    };
    (service as any).narrative = { compact: jest.fn().mockResolvedValue({ isOk: () => true }) };
    (service as any).rawStream = { ingest: jest.fn().mockResolvedValue([]) };
    (service as any).lightCone = {
      fastTick: jest.fn().mockReturnValue({ shouldMedium: false, shouldSlow: false, shouldGlobal: false, shouldDeep: false }),
      markMedium: jest.fn(), markSlow: jest.fn(), markGlobal: jest.fn(), markDeep: jest.fn(),
      getHotTraces: jest.fn().mockReturnValue([]),
      flushWrites: jest.fn().mockReturnValue({ writes: [], edgeUpdates: [] }),
      loadFromDb: jest.fn(), activateHot: jest.fn(),
    };
    (service as any).conceptSpace = { nameDimensions: jest.fn().mockResolvedValue(undefined) };
    (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  });

  describe('stabilization energy', () => {
    it('should compute lower energy for fewer commits with low novelty', () => {
      const stab = (service as any).computeStabilization(
        [makeCommit({ energy: 0.05, novelty_cost: 0.1 })],
        [makeCommit({ energy: 0.05 })],
        0.5,
      );
      expect(stab.energy).toBeLessThan(0.5);
    });

    it('should compute higher energy for escalations with high novelty', () => {
      const stab = (service as any).computeStabilization(
        [makeCommit({ energy: 0.8, novelty_cost: 0.9, is_escalation: true })],
        [],
        0.1,
      );
      expect(stab.energy).toBeGreaterThan(0.1);
    });

    it('should return stable=true for empty commits', () => {
      const stab = (service as any).computeStabilization([], [], 0.5);
      expect(stab.stable).toBe(true);
      expect(stab.energy).toBe(0);
    });
  });

  describe('guardrails', () => {
    it('should detect no orthogonal signals when all targets seen', () => {
      const hasOrtho = (service as any).hasOrthogonalSignals(
        [makeSignal({ targets: ['T1'] })],
        [makeCommit({ changes: { traces_activated: ['T1'], traces_suppressed: [], traces_created: [] } })],
      );
      expect(hasOrtho).toBe(false);
    });

    it('should detect orthogonal signals from new targets', () => {
      const hasOrtho = (service as any).hasOrthogonalSignals(
        [makeSignal({ targets: ['T_NEW'] })],
        [makeCommit({ changes: { traces_activated: ['T1'], traces_suppressed: [], traces_created: [] } })],
      );
      expect(hasOrtho).toBe(true);
    });

    it('should detect orthogonal from high novelty', () => {
      const hasOrtho = (service as any).hasOrthogonalSignals(
        [makeSignal({ targets: ['T1'], novelty_cost: 0.8 })],
        [makeCommit({ changes: { traces_activated: ['T1'], traces_suppressed: [], traces_created: [] } })],
      );
      expect(hasOrtho).toBe(true);
    });
  });

  describe('sleep duration', () => {
    it('should sleep longer with low arousal', () => {
      (service as any).affect.getSnapshot.mockReturnValue({ arousal: 0.1 });
      (service as any).eventQueue = [];
      const sleep = (service as any).computeSleepDuration();
      expect(sleep).toBeGreaterThan(1000);
    });

    it('should sleep shorter with high arousal', () => {
      (service as any).affect.getSnapshot.mockReturnValue({ arousal: 0.9 });
      (service as any).eventQueue = [];
      const sleep = (service as any).computeSleepDuration();
      expect(sleep).toBeLessThan(500);
    });

    it('should be immediate when events pending', () => {
      (service as any).affect.getSnapshot.mockReturnValue({ arousal: 0.1 });
      (service as any).eventQueue = [{ type: 'message', content: 'test', timestamp: 0 }];
      const sleep = (service as any).computeSleepDuration();
      expect(sleep).toBe(0);
    });
  });
});
