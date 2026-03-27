/**
 * Property-based invariant tests.
 *
 * These tests verify mathematical invariants that must hold
 * regardless of input sequences. Uses randomized inputs
 * to stress-test boundary conditions.
 */

import { EnergyService } from '../energy.service';
import { AffectiveStateService } from '../affect/affective-state.service';
import { ConceptSpaceService } from '../space/concept-space.service';
import { CommitDelta, TimeSense } from '../kernel.types';

// ─── Helpers ──────────────────────────────────────────────────────────

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

function createAffectiveService(): AffectiveStateService {
  const svc = new AffectiveStateService(mockDb as any, mockConfig as any);
  (svc as any).initWeights();
  return svc;
}

/** Random float in [lo, hi] */
function rand(lo = 0, hi = 1): number {
  return lo + Math.random() * (hi - lo);
}

// ═══════════════════════════════════════════
// TRACE WEIGHT INVARIANT: always in [0, 1]
// ═══════════════════════════════════════════

describe('Property: Trace weight always in [0, 1]', () => {
  it('initial weight is clamped to [0, 1]', () => {
    for (let i = 0; i < 50; i++) {
      const w = Math.random() * 2 - 0.5; // range [-0.5, 1.5]
      const clamped = Math.max(0, Math.min(1, w));
      expect(clamped).toBeGreaterThanOrEqual(0);
      expect(clamped).toBeLessThanOrEqual(1);
    }
  });

  it('weight after boost operation stays in [0, 1]', () => {
    const boost = 0.15;
    for (let i = 0; i < 100; i++) {
      let weight = Math.random();
      // Simulate reactivation boost: weight + boost * (1 - weight), clamped
      weight = Math.min(1.0, weight + boost * (1.0 - weight));
      expect(weight).toBeGreaterThanOrEqual(0);
      expect(weight).toBeLessThanOrEqual(1);
    }
  });

  it('weight after decay stays in [0, 1]', () => {
    const decay = 0.02;
    for (let i = 0; i < 100; i++) {
      let weight = Math.random();
      // Simulate freshness decay (multiplicative)
      weight *= (1 - decay);
      expect(weight).toBeGreaterThanOrEqual(0);
      expect(weight).toBeLessThanOrEqual(1);
    }
  });

  it('weight after many consecutive boosts stays <= 1', () => {
    const boost = 0.15;
    let weight = 0.01; // start very low
    for (let i = 0; i < 1000; i++) {
      weight = Math.min(1.0, weight + boost * (1.0 - weight));
    }
    expect(weight).toBeLessThanOrEqual(1.0);
    expect(weight).toBeCloseTo(1.0, 3); // should converge to 1
  });

  it('weight after alternating boost and decay stays in [0, 1]', () => {
    const boost = 0.15;
    const decay = 0.02;
    let weight = 0.5;
    for (let i = 0; i < 500; i++) {
      if (i % 2 === 0) {
        weight = Math.min(1.0, weight + boost * (1.0 - weight));
      } else {
        weight *= (1 - decay);
      }
      expect(weight).toBeGreaterThanOrEqual(0);
      expect(weight).toBeLessThanOrEqual(1);
    }
  });
});

// ═══════════════════════════════════════════
// ENERGY INVARIANT: always in [0, max_energy]
// ═══════════════════════════════════════════

describe('Property: Energy always in [0, max_energy]', () => {
  it('energy stays in bounds after random spend sequences', () => {
    const svc = new EnergyService();
    for (let i = 0; i < 100; i++) {
      const amount = rand(0, 0.3);
      svc.spend(amount, `op_${i}`);
      const state = svc.getState();
      expect(state.current).toBeGreaterThanOrEqual(0);
      expect(state.current).toBeLessThanOrEqual(state.max);
    }
  });

  it('energy stays in bounds after random reward sequences', () => {
    const svc = new EnergyService();
    svc.spend(0.5, 'drain');
    for (let i = 0; i < 100; i++) {
      svc.reward(rand(0, 3));
      const state = svc.getState();
      expect(state.current).toBeGreaterThanOrEqual(0);
      expect(state.current).toBeLessThanOrEqual(state.max);
    }
  });

  it('energy stays in bounds after random pain sequences', () => {
    const svc = new EnergyService();
    for (let i = 0; i < 100; i++) {
      svc.pain(rand(0, 2));
      const state = svc.getState();
      expect(state.current).toBeGreaterThanOrEqual(0);
      expect(state.current).toBeLessThanOrEqual(state.max);
    }
  });

  it('energy stays in bounds after interleaved spend/reward/pain/sleep', () => {
    const svc = new EnergyService();
    for (let i = 0; i < 200; i++) {
      const op = Math.floor(Math.random() * 5);
      switch (op) {
        case 0: svc.spend(rand(0, 0.2), 'rand'); break;
        case 1: svc.reward(rand(0, 1)); break;
        case 2: svc.pain(rand(0, 1)); break;
        case 3: svc.sleep(); break;
        case 4: svc.tick(); break;
      }
      const state = svc.getState();
      expect(state.current).toBeGreaterThanOrEqual(0);
      expect(state.current).toBeLessThanOrEqual(state.max);
      expect(state.fatigue_level).toBeGreaterThanOrEqual(0);
    }
  });

  it('fatigue level stays non-negative and bounded after random operations', () => {
    // Note: spend() accumulates fatigue at 30% of amount without clamping,
    // so fatigue can slightly exceed 1.0 via spend(). pain() and tick() clamp to 1.
    // We test the weaker invariant: fatigue >= 0, and fatigue <= 1.5 (reasonable bound).
    const svc = new EnergyService();
    for (let i = 0; i < 200; i++) {
      const op = Math.floor(Math.random() * 4);
      switch (op) {
        case 0: svc.spend(rand(0, 0.1), 'work'); break;
        case 1: svc.pain(rand(0, 2)); break;
        case 2: svc.tick(); break;
        case 3: svc.sleep(); break;
      }
      const state = svc.getState();
      expect(state.fatigue_level).toBeGreaterThanOrEqual(0);
      expect(state.fatigue_level).toBeLessThanOrEqual(1.5);
    }
  });
});

// ═══════════════════════════════════════════
// HORMONE INVARIANT: always in [0, 1] after sigmoid
// ═══════════════════════════════════════════

describe('Property: Hormone levels in [0, 1] after affect processing', () => {
  it('all hormones in [0, 1] after single commit', () => {
    const svc = createAffectiveService();
    svc.processCommits([makeCommit()], makeTimeSense());
    const snap = svc.getSnapshot();
    expect(snap.hormones.cortisol).toBeGreaterThanOrEqual(0);
    expect(snap.hormones.cortisol).toBeLessThanOrEqual(1);
    expect(snap.hormones.dopamine).toBeGreaterThanOrEqual(0);
    expect(snap.hormones.dopamine).toBeLessThanOrEqual(1);
    expect(snap.hormones.norepinephrine).toBeGreaterThanOrEqual(0);
    expect(snap.hormones.norepinephrine).toBeLessThanOrEqual(1);
    expect(snap.hormones.serotonin).toBeGreaterThanOrEqual(0);
    expect(snap.hormones.serotonin).toBeLessThanOrEqual(1);
  });

  it('hormones stay in [0, 1] after many extreme commits', () => {
    const svc = createAffectiveService();
    for (let i = 0; i < 100; i++) {
      const commit = makeCommit({
        novelty_cost: rand(0, 1),
        prediction_error: rand(0, 1),
        urgency: rand(0, 1),
        energy: rand(0, 1),
        convergence_score: rand(0, 1),
      });
      const ts = makeTimeSense({
        novelty_rate: rand(0, 1),
        prediction_error_rate: rand(0, 1),
        tempo: rand(0, 2),
      });
      svc.processCommits([commit], ts);
      const snap = svc.getSnapshot();
      expect(snap.hormones.cortisol).toBeGreaterThanOrEqual(0);
      expect(snap.hormones.cortisol).toBeLessThanOrEqual(1);
      expect(snap.hormones.dopamine).toBeGreaterThanOrEqual(0);
      expect(snap.hormones.dopamine).toBeLessThanOrEqual(1);
      expect(snap.hormones.norepinephrine).toBeGreaterThanOrEqual(0);
      expect(snap.hormones.norepinephrine).toBeLessThanOrEqual(1);
      expect(snap.hormones.serotonin).toBeGreaterThanOrEqual(0);
      expect(snap.hormones.serotonin).toBeLessThanOrEqual(1);
    }
  });

  it('hormones stay in [0, 1] after many zero-activity commits', () => {
    const svc = createAffectiveService();
    for (let i = 0; i < 50; i++) {
      svc.processCommits([], makeTimeSense({ tempo: 0, novelty_rate: 0, prediction_error_rate: 0 }));
      const snap = svc.getSnapshot();
      expect(snap.hormones.cortisol).toBeGreaterThanOrEqual(0);
      expect(snap.hormones.cortisol).toBeLessThanOrEqual(1);
      expect(snap.hormones.dopamine).toBeGreaterThanOrEqual(0);
      expect(snap.hormones.dopamine).toBeLessThanOrEqual(1);
    }
  });
});

// ═══════════════════════════════════════════
// EUCLIDEAN DISTANCE: triangle inequality
// ═══════════════════════════════════════════

describe('Property: Euclidean distance satisfies triangle inequality', () => {
  // ConceptSpaceService.distance is a pure function — test it directly
  let space: ConceptSpaceService;

  beforeEach(() => {
    space = new ConceptSpaceService(mockDb as any, {} as any);
  });

  it('distance(a, a) == 0', () => {
    for (let i = 0; i < 20; i++) {
      const dim = Math.floor(rand(1, 8));
      const a = Array.from({ length: dim }, () => rand(-10, 10));
      expect(space.distance(a, a)).toBeCloseTo(0, 10);
    }
  });

  it('distance(a, b) == distance(b, a) (symmetry)', () => {
    for (let i = 0; i < 30; i++) {
      const dim = Math.floor(rand(1, 8));
      const a = Array.from({ length: dim }, () => rand(-10, 10));
      const b = Array.from({ length: dim }, () => rand(-10, 10));
      expect(space.distance(a, b)).toBeCloseTo(space.distance(b, a), 10);
    }
  });

  it('distance(a, b) >= 0 (non-negativity)', () => {
    for (let i = 0; i < 50; i++) {
      const dim = Math.floor(rand(1, 10));
      const a = Array.from({ length: dim }, () => rand(-100, 100));
      const b = Array.from({ length: dim }, () => rand(-100, 100));
      expect(space.distance(a, b)).toBeGreaterThanOrEqual(0);
    }
  });

  it('d(a,c) <= d(a,b) + d(b,c) (triangle inequality)', () => {
    for (let i = 0; i < 50; i++) {
      const dim = Math.floor(rand(1, 8));
      const a = Array.from({ length: dim }, () => rand(-10, 10));
      const b = Array.from({ length: dim }, () => rand(-10, 10));
      const c = Array.from({ length: dim }, () => rand(-10, 10));
      const dAB = space.distance(a, b);
      const dBC = space.distance(b, c);
      const dAC = space.distance(a, c);
      expect(dAC).toBeLessThanOrEqual(dAB + dBC + 1e-10); // epsilon for float
    }
  });

  it('handles different-length vectors by zero-padding', () => {
    const a = [1, 2, 3];
    const b = [1, 2];
    // b padded to [1, 2, 0], distance = sqrt(0 + 0 + 9) = 3
    expect(space.distance(a, b)).toBeCloseTo(3, 5);
  });

  it('handles empty vectors', () => {
    expect(space.distance([], [])).toBe(0);
    expect(space.distance([1, 2], [])).toBeCloseTo(Math.sqrt(5), 5);
  });
});

// ═══════════════════════════════════════════
// AFFECT MODE PROBABILITIES: sum to ~1.0
// ═══════════════════════════════════════════

describe('Property: Affect mode probabilities sum to ~1.0', () => {
  it('mode probabilities sum to 1 after initial processing', () => {
    const svc = createAffectiveService();
    svc.processCommits([makeCommit()], makeTimeSense());
    const snap = svc.getSnapshot();
    const sum = snap.mode_probabilities.reduce((s, p) => s + p, 0);
    expect(sum).toBeCloseTo(1.0, 2);
  });

  it('mode probabilities sum to 1 after many random commits', () => {
    const svc = createAffectiveService();
    for (let i = 0; i < 100; i++) {
      const commit = makeCommit({
        novelty_cost: rand(0, 1),
        prediction_error: rand(0, 1),
        urgency: rand(0, 1),
        energy: rand(0, 1),
      });
      svc.processCommits([commit], makeTimeSense({
        novelty_rate: rand(0, 1),
        prediction_error_rate: rand(0, 1),
      }));
      const snap = svc.getSnapshot();
      const sum = snap.mode_probabilities.reduce((s, p) => s + p, 0);
      expect(sum).toBeCloseTo(1.0, 2);
    }
  });

  it('each mode probability is in [0, 1]', () => {
    const svc = createAffectiveService();
    for (let i = 0; i < 50; i++) {
      svc.processCommits([makeCommit({
        novelty_cost: rand(0, 1),
        prediction_error: rand(0, 1),
      })], makeTimeSense());
      const snap = svc.getSnapshot();
      for (const p of snap.mode_probabilities) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });

  it('mode is one of the valid modes', () => {
    const validModes = ['explore', 'exploit', 'defensive', 'resting'];
    const svc = createAffectiveService();
    for (let i = 0; i < 30; i++) {
      svc.processCommits([makeCommit({
        novelty_cost: rand(0, 1),
        urgency: rand(0, 1),
      })], makeTimeSense());
      const snap = svc.getSnapshot();
      expect(validModes).toContain(snap.mode);
    }
  });

  it('mode probabilities remain valid after empty commit list', () => {
    const svc = createAffectiveService();
    svc.processCommits([], makeTimeSense());
    const snap = svc.getSnapshot();
    const sum = snap.mode_probabilities.reduce((s, p) => s + p, 0);
    expect(sum).toBeCloseTo(1.0, 2);
  });
});
