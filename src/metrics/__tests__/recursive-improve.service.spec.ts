import { RecursiveImproveService } from '../recursive-improve.service';
import { ok } from 'neverthrow';
import { CognitiveSnapshot } from '../metrics.types';

function mockSnapshot(healthScore: number, weakDims: string[] = []): CognitiveSnapshot {
  return {
    id: 'snap_1',
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
    weak_dimensions: weakDims,
  };
}

describe('RecursiveImproveService', () => {
  let service: RecursiveImproveService;
  let mockMetrics: any;
  let mockDiagnosis: any;
  let mockExperiments: any;
  let mockDb: any;
  let mockEvents: any;

  beforeEach(() => {
    mockMetrics = { snapshot: jest.fn() };
    mockDiagnosis = { analyze: jest.fn() };
    mockExperiments = {
      runParamExperiment: jest.fn(),
      proposeLogicImprovement: jest.fn(),
    };
    mockDb = { create: jest.fn().mockResolvedValue(ok({})) };
    mockEvents = { emit: jest.fn().mockResolvedValue(undefined) };

    service = Object.create(RecursiveImproveService.prototype);
    (service as any).metrics = mockMetrics;
    (service as any).diagnosis = mockDiagnosis;
    (service as any).experiments = mockExperiments;
    (service as any).db = mockDb;
    (service as any).events = mockEvents;
    (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  });

  it('should skip improvement when system is healthy', async () => {
    mockMetrics.snapshot.mockResolvedValue(ok(mockSnapshot(0.9)));
    const result = await service.run();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.diagnoses_count).toBe(0);
      expect(result.value.experiments_run).toBe(0);
    }
    expect(mockDiagnosis.analyze).not.toHaveBeenCalled();
  });

  it('should run diagnosis and experiments for weak system', async () => {
    mockMetrics.snapshot.mockResolvedValue(ok(mockSnapshot(0.5, ['coherence', 'calibration'])));
    mockDiagnosis.analyze.mockResolvedValue(ok({
      diagnoses: [{
        dimension: 'calibration',
        severity: 'high',
        description: 'High ECE',
        root_cause: 'parameter',
        hypotheses: [{
          id: 'h1', type: 'param_adjustment',
          description: 'Tweak learning rate',
          target_service: 'Config',
          expected_improvement: 'Lower ECE',
          confidence: 0.7,
          param_changes: [{ key: 'bayesian.learning_rate', from: 0.3, to: 0.25 }],
        }],
      }],
      summary: 'Found 1 issue',
    }));
    mockExperiments.runParamExperiment.mockResolvedValue(ok({
      status: 'completed', verdict: 'improved',
    }));

    const result = await service.run();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.diagnoses_count).toBe(1);
      expect(result.value.experiments_run).toBe(1);
      expect(result.value.experiments_committed).toBe(1);
    }
  });

  it('should propose logic improvements instead of experimenting', async () => {
    mockMetrics.snapshot.mockResolvedValue(ok(mockSnapshot(0.5, ['episodes'])));
    mockDiagnosis.analyze.mockResolvedValue(ok({
      diagnoses: [{
        dimension: 'episodes',
        severity: 'high',
        description: 'Low success rate',
        root_cause: 'logic',
        hypotheses: [{
          id: 'h2', type: 'logic_extension',
          description: 'Add failure learning to deliberation',
          target_service: 'DeliberationService',
          expected_improvement: 'Higher success rate',
          confidence: 0.6,
          logic_proposal: 'Query failed episodes before generating options',
        }],
      }],
      summary: 'Found 1 logic issue',
    }));
    mockExperiments.proposeLogicImprovement.mockResolvedValue(ok({ status: 'pending' }));

    const result = await service.run();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.logic_proposals_created).toBe(1);
      expect(result.value.experiments_run).toBe(0);
    }
  });

  it('should limit param experiments to 3 per run', async () => {
    mockMetrics.snapshot.mockResolvedValue(ok(mockSnapshot(0.3, ['coherence', 'calibration', 'beliefs', 'episodes'])));
    mockDiagnosis.analyze.mockResolvedValue(ok({
      diagnoses: Array.from({ length: 5 }, (_, i) => ({
        dimension: `dim_${i}`,
        severity: 'high',
        description: `Issue ${i}`,
        root_cause: 'parameter',
        hypotheses: [{
          id: `h${i}`, type: 'param_adjustment',
          description: `Fix ${i}`,
          target_service: 'Config',
          expected_improvement: 'Better',
          confidence: 0.8 - i * 0.1,
          param_changes: [{ key: `param.${i}`, from: 0.5, to: 0.4 }],
        }],
      })),
      summary: 'Found 5 issues',
    }));
    mockExperiments.runParamExperiment.mockResolvedValue(ok({ status: 'completed', verdict: 'neutral' }));

    const result = await service.run();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.experiments_run).toBe(3); // max 3
    }
  });

  it('should handle mixed param + logic hypotheses', async () => {
    mockMetrics.snapshot.mockResolvedValue(ok(mockSnapshot(0.5, ['coherence'])));
    mockDiagnosis.analyze.mockResolvedValue(ok({
      diagnoses: [{
        dimension: 'coherence',
        severity: 'high',
        description: 'Multiple issues',
        root_cause: 'parameter',
        hypotheses: [
          {
            id: 'h_param', type: 'param_adjustment',
            description: 'Tweak param', target_service: 'Config',
            expected_improvement: 'Better', confidence: 0.8,
            param_changes: [{ key: 'decay.rate_normal', from: 0.01, to: 0.008 }],
          },
          {
            id: 'h_logic', type: 'logic_extension',
            description: 'Add stage', target_service: 'NightlyService',
            expected_improvement: 'Better', confidence: 0.6,
            logic_proposal: 'New nightly stage...',
          },
        ],
      }],
      summary: 'Mixed',
    }));
    mockExperiments.runParamExperiment.mockResolvedValue(ok({ status: 'completed', verdict: 'improved' }));
    mockExperiments.proposeLogicImprovement.mockResolvedValue(ok({ status: 'pending' }));

    const result = await service.run();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.experiments_run).toBe(1);
      expect(result.value.logic_proposals_created).toBe(1);
    }
  });
});
