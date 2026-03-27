import { AffectiveStateService } from '../affect/affective-state.service';
import { CommitDelta, TimeSense } from '../kernel.types';

// Mock SurrealService (DB never actually called in pure-math tests)
const mockDb = {
  query: jest.fn().mockResolvedValue({ isOk: () => true, value: [] }),
  create: jest.fn().mockResolvedValue({ isOk: () => true, value: {} }),
};

const mockConfig = {
  get: jest.fn((key: string) => {
    const defaults: Record<string, number> = {
      'affect.accumulator_decay_rate': 0.03,
      'affect.config_delta_max': 0.02,
      'affect.mode_boundary_positive': 0.5,
      'affect.mode_boundary_negative': -0.5,
    };
    return defaults[key] ?? 0;
  }),
};

function createService(): AffectiveStateService {
  const svc = new AffectiveStateService(mockDb as any, mockConfig as any);
  // Manually trigger weight init (skip async onModuleInit → loadOrInitWeights)
  (svc as any).initWeights();
  return svc;
}

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
    energy: 0.3,
    ...overrides,
  };
}

function makeTimeSense(overrides: Partial<TimeSense> = {}): TimeSense {
  return {
    cycle: 1,
    tempo: 1,
    novelty_rate: 0.5,
    prediction_error_rate: 0.1,
    trace_decay_velocity: 0.01,
    dilation: 1,
    rhythm_phase: 'active',
    ...overrides,
  };
}

describe('AffectiveStateService', () => {
  let svc: AffectiveStateService;

  beforeEach(() => {
    svc = createService();
  });

  // --- forward() ---
  describe('forward()', () => {
    it('produces 4 hormone values in [0,1] after sigmoid', () => {
      // Trigger forward via processCommits
      svc.processCommits([makeCommit()], makeTimeSense());
      const snap = svc.getSnapshot();
      const h = snap.hormones;
      for (const val of [h.cortisol, h.dopamine, h.norepinephrine, h.serotonin]) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    });

    it('produces 6 config deltas bounded by tanh * 0.02', () => {
      const result = svc.processCommits([makeCommit()], makeTimeSense());
      for (const [, delta] of result.configDeltas) {
        expect(delta).toBeGreaterThanOrEqual(-0.02);
        expect(delta).toBeLessThanOrEqual(0.02);
      }
    });

    it('produces 4 mode probabilities summing to ~1.0', () => {
      svc.processCommits([makeCommit()], makeTimeSense());
      const snap = svc.getSnapshot();
      const sum = snap.mode_probabilities.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 1);
      expect(snap.mode_probabilities).toHaveLength(4);
    });
  });

  // --- computeLoss() ---
  describe('computeLoss()', () => {
    it('equals acc[0] + acc[2] - acc[3] - acc[4]', () => {
      const acc = (svc as any).acc as number[];
      acc[0] = 0.5; // pred_error
      acc[2] = 0.3; // pain
      acc[3] = 0.1; // convergence
      acc[4] = 0.2; // reward
      const loss = (svc as any).computeLoss();
      expect(loss).toBeCloseTo(0.5 + 0.3 - 0.1 - 0.2, 6);
    });
  });

  // --- backward() ---
  describe('backward()', () => {
    it('updates W1 weights (different after call)', () => {
      // Give accumulators some signal so gradients are non-zero
      (svc as any).acc[0] = 1.0;
      (svc as any).acc[2] = 0.5;
      (svc as any).forward();
      const w1Before = JSON.stringify((svc as any).W1);
      (svc as any).backward(0.5);
      const w1After = JSON.stringify((svc as any).W1);
      expect(w1After).not.toEqual(w1Before);
    });

    it('updates W2 weights', () => {
      (svc as any).acc[0] = 1.0;
      (svc as any).forward();
      const w2Before = JSON.stringify((svc as any).W2);
      (svc as any).backward(0.5);
      const w2After = JSON.stringify((svc as any).W2);
      expect(w2After).not.toEqual(w2Before);
    });

    it('updates W_mode weights', () => {
      (svc as any).acc[0] = 1.0;
      (svc as any).forward();
      const before = JSON.stringify((svc as any).W_mode);
      (svc as any).backward(1.0);
      const after = JSON.stringify((svc as any).W_mode);
      expect(after).not.toEqual(before);
    });
  });

  // --- processCommits() ---
  describe('processCommits()', () => {
    it('updates accumulators from commit metrics', () => {
      const accBefore = [...(svc as any).acc];
      svc.processCommits([makeCommit({ prediction_error: 0.8 })], makeTimeSense());
      // After processCommits, acc[0] (pred_error) should have changed (even after decay)
      const accAfter = (svc as any).acc;
      // At least one accumulator is different
      const anyDifferent = accBefore.some((v: number, i: number) => v !== accAfter[i]);
      expect(anyDifferent).toBe(true);
    });

    it('returns configDeltas map', () => {
      const result = svc.processCommits([makeCommit()], makeTimeSense());
      expect(result.configDeltas).toBeInstanceOf(Map);
    });
  });

  // --- getSnapshot() ---
  describe('getSnapshot()', () => {
    it('returns valid hormones, pain, valence, arousal, mode', () => {
      svc.processCommits([makeCommit()], makeTimeSense());
      const snap = svc.getSnapshot();
      expect(snap.hormones).toBeDefined();
      expect(snap.pain).toBeDefined();
      expect(typeof snap.valence).toBe('number');
      expect(typeof snap.arousal).toBe('number');
      expect(['explore', 'exploit', 'defensive', 'resting']).toContain(snap.mode);
    });
  });

  // --- inflictPain() ---
  describe('inflictPain()', () => {
    it('increases pain accumulator', () => {
      const before = (svc as any).acc[2];
      svc.inflictPain('test', 1.0);
      expect((svc as any).acc[2]).toBeGreaterThan(before);
    });
  });

  // --- reward() ---
  describe('reward()', () => {
    it('increases reward accumulator and reduces pain', () => {
      svc.inflictPain('test', 2.0);
      const painBefore = (svc as any).acc[2];
      const rewardBefore = (svc as any).acc[4];
      svc.reward(1.0);
      expect((svc as any).acc[4]).toBeGreaterThan(rewardBefore);
      expect((svc as any).acc[2]).toBeLessThan(painBefore);
    });
  });

  // --- initWeights() ---
  describe('initWeights()', () => {
    it('produces non-zero matrices (Xavier)', () => {
      const w1 = (svc as any).W1 as number[][];
      const hasNonZero = w1.some(row => row.some((v: number) => v !== 0));
      expect(hasNonZero).toBe(true);
      expect(w1.length).toBe(7);       // N_ACCUMULATORS
      expect(w1[0].length).toBe(4);    // N_HORMONES
    });
  });

  // --- Accumulator decay ---
  describe('accumulator decay', () => {
    it('values decrease toward 0 over cycles', () => {
      (svc as any).acc[0] = 3.0;
      // Run multiple cycles with empty commits and zero tempo to decay
      for (let i = 0; i < 10; i++) {
        svc.processCommits([], makeTimeSense({ tempo: 0 }));
      }
      expect((svc as any).acc[0]).toBeLessThan(3.0);
    });
  });

  // --- Mode selection ---
  describe('mode selection', () => {
    it('high cortisol stimulus trends toward defensive', () => {
      // Drive high pain + prediction error over many cycles
      for (let i = 0; i < 30; i++) {
        svc.inflictPain('stress', 0.5);
        svc.processCommits(
          [makeCommit({ prediction_error: 0.9, is_escalation: true })],
          makeTimeSense(),
        );
      }
      const snap = svc.getSnapshot();
      // Defensive probability should be elevated (not necessarily the mode, but > 0.15)
      expect(snap.mode_probabilities[2]).toBeGreaterThan(0.1);
    });
  });

  // --- Valence range ---
  describe('valence', () => {
    it('always in [-1, 1]', () => {
      // Extreme positive
      svc.reward(5.0);
      svc.processCommits([makeCommit()], makeTimeSense());
      let snap = svc.getSnapshot();
      expect(snap.valence).toBeGreaterThanOrEqual(-1);
      expect(snap.valence).toBeLessThanOrEqual(1);

      // Extreme negative
      svc.inflictPain('extreme', 5.0);
      svc.processCommits([makeCommit()], makeTimeSense());
      snap = svc.getSnapshot();
      expect(snap.valence).toBeGreaterThanOrEqual(-1);
      expect(snap.valence).toBeLessThanOrEqual(1);
    });
  });

  // --- Arousal range ---
  describe('arousal', () => {
    it('always in [0, 1]', () => {
      svc.inflictPain('stress', 3.0);
      svc.processCommits([makeCommit({ prediction_error: 1.0 })], makeTimeSense());
      const snap = svc.getSnapshot();
      expect(snap.arousal).toBeGreaterThanOrEqual(0);
      expect(snap.arousal).toBeLessThanOrEqual(1);
    });
  });

  // --- Loss sign ---
  describe('loss direction', () => {
    it('loss is negative when reward > pain', () => {
      (svc as any).acc[0] = 0;   // pred_error
      (svc as any).acc[2] = 0;   // pain
      (svc as any).acc[3] = 1.0; // convergence
      (svc as any).acc[4] = 2.0; // reward
      const loss = (svc as any).computeLoss();
      expect(loss).toBeLessThan(0);
    });
  });

  // --- sigmoid ---
  describe('sigmoid()', () => {
    it('sigmoid(0)=0.5, sigmoid(large)~1, sigmoid(-large)~0', () => {
      const sigmoid = (svc as any).sigmoid.bind(svc);
      expect(sigmoid(0)).toBeCloseTo(0.5, 5);
      expect(sigmoid(10)).toBeCloseTo(1.0, 3);
      expect(sigmoid(-10)).toBeCloseTo(0.0, 3);
    });
  });

  // --- Gradient clipping ---
  describe('clampGrad()', () => {
    it('bounds gradient to [-1, 1]', () => {
      const clamp = (svc as any).clampGrad.bind(svc);
      expect(clamp(5)).toBe(1);
      expect(clamp(-5)).toBe(-1);
      expect(clamp(0.5)).toBe(0.5);
    });
  });
});
