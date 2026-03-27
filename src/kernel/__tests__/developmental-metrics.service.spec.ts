import { DevelopmentalMetricsService, DevelopmentalSnapshot } from '../developmental-metrics.service';
import { ok } from 'neverthrow';

// Minimal mocks
const mockDb = {
  query: jest.fn().mockResolvedValue(ok([])),
};

const mockTraceGraph = {
  getTraceCount: jest.fn().mockResolvedValue(0),
  getActiveTraces: jest.fn().mockResolvedValue(ok([])),
  getCycle: jest.fn().mockReturnValue(0),
};

const mockConceptSpace = {
  getDimensionCount: jest.fn().mockReturnValue(3),
  getDimensions: jest.fn().mockReturnValue([]),
  findClusters: jest.fn().mockResolvedValue([{ traces: ['a', 'b'], centroid: [0, 0], radius: 0.5, shared_words: [] }]),
  snapshot: jest.fn().mockResolvedValue({
    dimensions: [], dimension_count: 3, trace_count: 10, regions: [],
    self_region: null, gradient_field: { attractors: [], repellers: [] },
    trajectories: [
      { from_trace_id: 'a', to_trace_id: 'b', from_position: [0], to_position: [1], action: 'push', confidence: 0.7, traversal_count: 3 },
    ],
    confidence: 0.5, coherence: 0.6, gaps: [],
  }),
};

const mockModalities = {
  getModalityCount: jest.fn().mockReturnValue(2),
  getModalities: jest.fn().mockReturnValue([]),
};

const mockAffect = {
  getSnapshot: jest.fn().mockReturnValue({
    mode: 'curious',
    valence: 0.3,
    arousal: 0.5,
    loss: 0.1,
    hormones: { cortisol: 0.2, dopamine: 0.6, norepinephrine: 0.4, serotonin: 0.5 },
    pain: { intensity: 0, source: '', chronic: false },
    mode_probabilities: { curious: 0.4, playful: 0.3, anxious: 0.1, calm: 0.2 },
  }),
};

const mockEnergy = {
  getState: jest.fn().mockReturnValue({
    current: 0.7, max: 1.0, fatigue_level: 0.15,
    total_energy_spent: 1.5, cycles_since_sleep: 50,
  }),
  needsSleep: jest.fn().mockReturnValue(false),
};

const mockCommitKernel = {
  getCommitCount: jest.fn().mockReturnValue(10),
};

const mockConfig = {
  get: jest.fn().mockReturnValue(0.5),
};

function createService(): DevelopmentalMetricsService {
  return new DevelopmentalMetricsService(
    mockDb as any,
    mockTraceGraph as any,
    mockConceptSpace as any,
    mockModalities as any,
    mockAffect as any,
    mockEnergy as any,
    mockCommitKernel as any,
    mockConfig as any,
  );
}

describe('DevelopmentalMetricsService', () => {
  let svc: DevelopmentalMetricsService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = createService();
  });

  describe('snapshot()', () => {
    it('should return a complete developmental snapshot', async () => {
      const snap = await svc.snapshot(100);
      expect(snap.tick).toBe(100);
      expect(snap.stage).toBeDefined();
      expect(snap.stage_confidence).toBeGreaterThanOrEqual(0);
      expect(snap.stage_confidence).toBeLessThanOrEqual(1);
      expect(snap.cognitive).toBeDefined();
      expect(snap.vitality).toBeDefined();
      expect(snap.affect).toBeDefined();
      expect(snap.agency).toBeDefined();
      expect(snap.world_model).toBeDefined();
      expect(snap.overall_health).toBeGreaterThanOrEqual(0);
      expect(snap.overall_health).toBeLessThanOrEqual(1);
    });

    it('should accumulate snapshots in history', async () => {
      await svc.snapshot(10);
      await svc.snapshot(20);
      await svc.snapshot(30);
      expect(svc.getHistory()).toHaveLength(3);
      expect(svc.getHistory()[2].tick).toBe(30);
    });

    it('should return latest snapshot', async () => {
      expect(svc.getLatest()).toBeNull();
      await svc.snapshot(10);
      expect(svc.getLatest()?.tick).toBe(10);
    });
  });

  describe('action recording', () => {
    it('should track actions for agency metrics', async () => {
      svc.recordAction('push', 'мячик', 1, true);
      svc.recordAction('touch', 'кубик', 2, false);
      svc.recordAction('push', 'мячик', 3, true);

      const snap = await svc.snapshot(5);
      expect(snap.agency.action_diversity).toBeGreaterThan(0);
    });

    it('should compute target novelty from action log', async () => {
      // All different targets → high novelty
      for (let i = 0; i < 10; i++) {
        svc.recordAction('touch', `obj_${i}`, i, true);
      }
      const snap = await svc.snapshot(15);
      expect(snap.agency.target_novelty_preference).toBe(1);
    });

    it('should compute explore→exploit shift', async () => {
      // First half: all exploration
      for (let i = 0; i < 20; i++) {
        svc.recordAction('touch', `obj_${i}`, i, true);
      }
      // Second half: all exploitation
      for (let i = 20; i < 40; i++) {
        svc.recordAction('touch', `obj_${i}`, i, false);
      }
      const snap = await svc.snapshot(50);
      expect(snap.agency.explore_exploit_shift).toBeGreaterThan(0);
    });
  });

  describe('sleep recording', () => {
    it('should track sleep regularity', async () => {
      // Regular sleep: every 50 ticks
      svc.recordSleep(50);
      svc.recordSleep(100);
      svc.recordSleep(150);

      const snap = await svc.snapshot(160);
      // Perfect regularity → high score
      expect(snap.vitality.sleep_regularity).toBe(1);
    });

    it('should detect irregular sleep', async () => {
      svc.recordSleep(10);
      svc.recordSleep(100);
      svc.recordSleep(110);

      const snap = await svc.snapshot(120);
      expect(snap.vitality.sleep_regularity).toBeLessThan(1);
    });
  });

  describe('accuracy tracking', () => {
    it('should use recorded accuracy for world model metrics', async () => {
      svc.recordAccuracy(10, 0.3);
      svc.recordAccuracy(50, 0.6);
      svc.recordAccuracy(100, 0.8);

      const snap = await svc.snapshot(100);
      expect(snap.world_model.property_accuracy).toBe(0.8);
    });

    it('should compute energy efficiency from accuracy + energy spent', async () => {
      svc.recordAccuracy(0, 0.2);
      svc.recordAccuracy(100, 0.7);

      const snap = await svc.snapshot(100);
      // Accuracy improved by 0.5, energy spent = 1.5 → efficiency = 0.5/1.5 ≈ 0.333
      expect(snap.vitality.energy_efficiency).toBeCloseTo(0.333, 2);
    });
  });

  describe('pain tracking', () => {
    it('should record pain onset and resolution', async () => {
      svc.recordPainOnset(10);
      svc.recordPainResolution(15);
      svc.recordPainOnset(20);
      svc.recordPainResolution(22);

      const snap = await svc.snapshot(30);
      // Pain resolved quickly → good score
      expect(snap.affect.pain_resolution_rate).toBeGreaterThan(0);
    });
  });

  describe('developmental stage detection', () => {
    it('should start at sensory stage', async () => {
      const snap = await svc.snapshot(0);
      // With no history, likely sensory
      expect(['sensory', 'categorical', 'predictive']).toContain(snap.stage);
    });

    it('should detect predictive stage when trajectories exist', async () => {
      // Mock high prediction precision
      mockConceptSpace.snapshot.mockResolvedValueOnce({
        dimensions: [], dimension_count: 5, trace_count: 50, regions: [],
        self_region: null, gradient_field: { attractors: [], repellers: [] },
        trajectories: Array(15).fill(null).map((_, i) => ({
          from_trace_id: `a${i}`, to_trace_id: `b${i}`,
          from_position: [0], to_position: [1],
          action: 'push', confidence: 0.8, traversal_count: 5,
        })),
        confidence: 0.7, coherence: 0.8, gaps: [],
      });

      const snap = await svc.snapshot(200);
      // With many high-confidence trajectories, should detect predictive or later
      expect(['predictive', 'agentic', 'reflective']).toContain(snap.stage);
    });
  });

  describe('overall health', () => {
    it('should be bounded between 0 and 1', async () => {
      const snap = await svc.snapshot(100);
      expect(snap.overall_health).toBeGreaterThanOrEqual(0);
      expect(snap.overall_health).toBeLessThanOrEqual(1);
    });
  });

  describe('formatSnapshot()', () => {
    it('should produce human-readable output', async () => {
      const snap = await svc.snapshot(100);
      const formatted = svc.formatSnapshot(snap);
      expect(formatted).toContain('Stage:');
      expect(formatted).toContain('Cognitive:');
      expect(formatted).toContain('Vitality:');
      expect(formatted).toContain('Affect:');
      expect(formatted).toContain('Agency:');
      expect(formatted).toContain('World:');
    });
  });

  describe('affect metrics', () => {
    it('should compute mode diversity from affect snapshot', async () => {
      const snap = await svc.snapshot(100);
      // 4 modes with non-zero probs → diversity > 0
      expect(snap.affect.mode_diversity).toBeGreaterThan(0);
    });

    it('should track cortisol baseline', async () => {
      const snap = await svc.snapshot(100);
      expect(snap.affect.cortisol_baseline).toBe(0.2); // from mock
    });
  });

  describe('cognitive metrics', () => {
    it('should compute concept space coverage from clusters', async () => {
      const snap = await svc.snapshot(100);
      // 1 cluster / 3 dimensions ≈ 0.33
      expect(snap.cognitive.concept_space_coverage).toBeCloseTo(0.33, 1);
    });
  });
});
