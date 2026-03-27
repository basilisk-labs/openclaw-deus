import { ExperimentService } from '../experiment.service';
import { Hypothesis } from '../diagnosis.types';
import { CognitiveSnapshot } from '../metrics.types';
import { BenchmarkSuiteResult } from '../benchmark.types';
import { ok } from 'neverthrow';

function mockSnapshot(healthScore: number, overrides?: Partial<CognitiveSnapshot>): CognitiveSnapshot {
  return {
    timestamp: new Date().toISOString(),
    dimensions: {
      coherence: { score: 0.85, posture: 'stable', contradictions: 0 },
      calibration: { ece: 0.05, overconfident: false, sample_size: 50 },
      knowledge: { total: 30, gaps_open: 2, gaps_high_impact: 0, extraction_rate: 5 },
      beliefs: { total: 20, active: 15, avg_confidence: 0.75, decay_rate: 1, promotion_rate: 2 },
      intentions: { active: 3, completion_rate: 0.6, stale_count: 0, avg_duration_ms: 500 },
      deliberation: { total: 10, safety_pass_rate: 0.9, avg_options: 2.5 },
      episodes: { total: 20, success_rate: 0.7, trend: 'stable' },
      pipeline: { avg_duration_ms: 800, error_rate: 0.02, throughput: 50 },
      world_model: { confidence: 0.75, freshness_hours: 2 },
      llm: { daily_tokens_used: 50000, budget_utilization: 0.1, cache_hit_rate: 0.3 },
    },
    health_score: healthScore,
    weak_dimensions: [],
    ...overrides,
  };
}

function mockBenchSuite(passed: number, total: number): BenchmarkSuiteResult {
  const results = Array.from({ length: total }, (_, i) => ({
    scenario_id: `bench_${i}`,
    scenario_name: `Benchmark ${i}`,
    passed: i < passed,
    actual: {},
    expected: {},
    failures: i < passed ? [] : ['failed'],
    duration_ms: 100,
    run_at: new Date().toISOString(),
  }));
  return { total, passed, failed: total - passed, results, duration_ms: 500, run_at: new Date().toISOString() };
}

describe('ExperimentService', () => {
  let service: ExperimentService;
  let mockConfig: any;
  let mockMetrics: any;
  let mockBenchmarks: any;
  let mockDb: any;
  let mockEvents: any;

  beforeEach(() => {
    const configValues: Record<string, number> = { 'bayesian.learning_rate': 0.3, 'decay.rate_normal': 0.01 };
    mockConfig = {
      get: jest.fn((key: string) => configValues[key] ?? 0),
      set: jest.fn().mockResolvedValue(ok(undefined)),
      getAll: jest.fn(() => Object.entries(configValues).map(([key, value]) => ({ key, value, tunable: true }))),
    };
    mockMetrics = {
      snapshot: jest.fn().mockResolvedValue(ok(mockSnapshot(0.75))),
    };
    mockBenchmarks = {
      runAll: jest.fn().mockResolvedValue(ok(mockBenchSuite(6, 8))),
    };
    mockDb = {
      create: jest.fn().mockResolvedValue(ok({})),
    };
    mockEvents = {
      emit: jest.fn().mockResolvedValue(undefined),
    };

    service = Object.create(ExperimentService.prototype);
    (service as any).config = mockConfig;
    (service as any).metrics = mockMetrics;
    (service as any).benchmarks = mockBenchmarks;
    (service as any).db = mockDb;
    (service as any).events = mockEvents;
    (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  });

  describe('runParamExperiment', () => {
    it('should reject non-param hypotheses', async () => {
      const hyp: Hypothesis = {
        id: 'h1', type: 'logic_extension', description: 'test',
        target_service: 'Foo', expected_improvement: 'bar', confidence: 0.5,
      };
      const result = await service.runParamExperiment(hyp);
      expect(result.isErr()).toBe(true);
    });

    it('should reject excessive param deltas', async () => {
      const hyp: Hypothesis = {
        id: 'h1', type: 'param_adjustment', description: 'test',
        target_service: 'Config', expected_improvement: 'better', confidence: 0.5,
        param_changes: [{ key: 'bayesian.learning_rate', from: 0.3, to: 0.9 }],
      };
      const result = await service.runParamExperiment(hyp);
      expect(result.isErr()).toBe(true);
    });

    it('should run full experiment lifecycle for valid hypothesis', async () => {
      const hyp: Hypothesis = {
        id: 'h1', type: 'param_adjustment', description: 'tweak learning rate',
        target_service: 'Config', expected_improvement: 'lower ECE', confidence: 0.7,
        param_changes: [{ key: 'bayesian.learning_rate', from: 0.3, to: 0.28 }],
      };
      const result = await service.runParamExperiment(hyp);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(['completed', 'rolled_back']).toContain(result.value.status);
        expect(result.value.mutations).toEqual(hyp.param_changes);
        expect(result.value.finished_at).toBeDefined();
        expect(mockEvents.emit).toHaveBeenCalled();
      }
    });

    it('should rollback when benchmarks regress', async () => {
      // First benchmark run: 6/8 passed (baseline)
      // Second benchmark run: 4/8 passed (regression)
      let callCount = 0;
      mockBenchmarks.runAll = jest.fn(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(ok(mockBenchSuite(6, 8)));
        return Promise.resolve(ok(mockBenchSuite(4, 8)));
      });

      // Post-metrics show lower health
      let metricsCallCount = 0;
      mockMetrics.snapshot = jest.fn(() => {
        metricsCallCount++;
        if (metricsCallCount === 1) return Promise.resolve(ok(mockSnapshot(0.75)));
        return Promise.resolve(ok(mockSnapshot(0.60)));
      });

      const hyp: Hypothesis = {
        id: 'h2', type: 'param_adjustment', description: 'bad tweak',
        target_service: 'Config', expected_improvement: 'nothing', confidence: 0.5,
        param_changes: [{ key: 'bayesian.learning_rate', from: 0.3, to: 0.28 }],
      };
      const result = await service.runParamExperiment(hyp);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.status).toBe('rolled_back');
        expect(result.value.verdict).toBe('regressed');
        // Config should have been rolled back
        expect(mockConfig.set).toHaveBeenCalledWith('bayesian.learning_rate', 0.3, 'experiment rollback');
      }
    });
  });

  describe('proposeLogicImprovement', () => {
    it('should create a pending improvement record', async () => {
      mockDb.create = jest.fn().mockResolvedValue(ok({
        hypothesis_id: 'h1', type: 'logic_extension', status: 'pending',
        target_service: 'DeliberationService', description: 'Add failure learning',
        logic_proposal: 'Before generating options...', expected_improvement: 'Higher success rate',
        created_at: new Date().toISOString(),
      }));

      const hyp: Hypothesis = {
        id: 'h1', type: 'logic_extension',
        description: 'Add failure learning',
        target_service: 'DeliberationService',
        expected_improvement: 'Higher success rate',
        confidence: 0.6,
        logic_proposal: 'Before generating options...',
      };

      const result = await service.proposeLogicImprovement(hyp);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.status).toBe('pending');
        expect(result.value.target_service).toBe('DeliberationService');
      }
      expect(mockEvents.emit).toHaveBeenCalledWith('improvement.proposed', expect.any(Object));
    });
  });
});
