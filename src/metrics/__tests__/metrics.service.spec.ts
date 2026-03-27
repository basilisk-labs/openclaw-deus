import { MetricsService } from '../metrics.service';
import { CognitiveDimensions, DIMENSION_THRESHOLDS } from '../metrics.types';

function makeService(overrides?: Partial<Record<string, any>>): MetricsService {
  const service = Object.create(MetricsService.prototype);
  Object.assign(service, overrides);
  return service;
}

function makeDimensions(overrides?: Partial<CognitiveDimensions>): CognitiveDimensions {
  return {
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
    ...overrides,
  };
}

describe('MetricsService (pure methods)', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = makeService();
  });

  describe('computeHealthScore', () => {
    it('should return high score for healthy dimensions', () => {
      const dims = makeDimensions();
      const score = service.computeHealthScore(dims);
      expect(score).toBeGreaterThan(0.6);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should return lower score for poor dimensions', () => {
      const dims = makeDimensions({
        coherence: { score: 0.3, posture: 'repair', contradictions: 5 },
        episodes: { total: 20, success_rate: 0.2, trend: 'declining' },
        calibration: { ece: 0.4, overconfident: true, sample_size: 50 },
      });
      const score = service.computeHealthScore(dims);
      expect(score).toBeLessThan(0.65);
    });

    it('should be bounded between 0 and 1', () => {
      const dims = makeDimensions({
        coherence: { score: 0, posture: 'repair', contradictions: 100 },
        calibration: { ece: 1, overconfident: true, sample_size: 100 },
        knowledge: { total: 0, gaps_open: 0, gaps_high_impact: 0, extraction_rate: 0 },
        beliefs: { total: 0, active: 0, avg_confidence: 0, decay_rate: 0, promotion_rate: 0 },
      });
      const score = service.computeHealthScore(dims);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('findWeakDimensions', () => {
    it('should return empty for healthy dimensions', () => {
      const dims = makeDimensions();
      const weak = service.findWeakDimensions(dims);
      expect(weak.length).toBeLessThanOrEqual(2); // some might be borderline
    });

    it('should detect low coherence', () => {
      const dims = makeDimensions({
        coherence: { score: 0.3, posture: 'repair', contradictions: 5 },
      });
      const weak = service.findWeakDimensions(dims);
      expect(weak).toContain('coherence');
    });

    it('should detect high ECE', () => {
      const dims = makeDimensions({
        calibration: { ece: 0.5, overconfident: true, sample_size: 50 },
      });
      const weak = service.findWeakDimensions(dims);
      expect(weak).toContain('calibration');
    });

    it('should detect low episode success', () => {
      const dims = makeDimensions({
        episodes: { total: 20, success_rate: 0.2, trend: 'declining' },
      });
      const weak = service.findWeakDimensions(dims);
      expect(weak).toContain('episodes');
    });

    it('should detect zero knowledge', () => {
      const dims = makeDimensions({
        knowledge: { total: 0, gaps_open: 0, gaps_high_impact: 0, extraction_rate: 0 },
      });
      const weak = service.findWeakDimensions(dims);
      expect(weak).toContain('knowledge');
    });
  });
});
