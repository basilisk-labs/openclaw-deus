import { DiagnosisService } from '../diagnosis.service';
import { CognitiveSnapshot, CognitiveDimensions } from '../metrics.types';
import { mockCognitiveConfig } from '../../__mocks__/cognitive-config.mock';

function makeService(): DiagnosisService {
  const service = Object.create(DiagnosisService.prototype);
  (service as any).config = mockCognitiveConfig;
  (service as any).db = { query: jest.fn().mockResolvedValue({ isOk: () => true, value: [] }) };
  (service as any).llm = { isAvailable: () => false };
  return service;
}

function makeSnapshot(overrides?: Partial<CognitiveDimensions>): CognitiveSnapshot {
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
      ...overrides,
    },
    health_score: 0.75,
    weak_dimensions: [],
  };
}

describe('DiagnosisService (rule-based)', () => {
  let service: DiagnosisService;

  beforeEach(() => {
    service = makeService();
  });

  describe('runRuleBasedDiagnosis', () => {
    it('should return empty for healthy snapshot', () => {
      const snapshot = makeSnapshot();
      const diagnoses = service.runRuleBasedDiagnosis(snapshot);
      expect(diagnoses.length).toBe(0);
    });

    it('should detect low coherence', () => {
      const snapshot = makeSnapshot({
        coherence: { score: 0.4, posture: 'repair', contradictions: 5 },
        beliefs: { total: 20, active: 15, avg_confidence: 0.4, decay_rate: 1, promotion_rate: 2 },
      });
      const diagnoses = service.runRuleBasedDiagnosis(snapshot);
      const coherenceDiag = diagnoses.find((d) => d.dimension === 'coherence');
      expect(coherenceDiag).toBeDefined();
      expect(['high', 'critical']).toContain(coherenceDiag!.severity);
      expect(coherenceDiag!.hypotheses.length).toBeGreaterThan(0);
    });

    it('should detect high ECE with overconfidence', () => {
      const snapshot = makeSnapshot({
        calibration: { ece: 0.25, overconfident: true, sample_size: 50 },
      });
      const diagnoses = service.runRuleBasedDiagnosis(snapshot);
      const calDiag = diagnoses.find((d) => d.dimension === 'calibration');
      expect(calDiag).toBeDefined();
      expect(calDiag!.hypotheses[0].type).toBe('param_adjustment');
      expect(calDiag!.hypotheses[0].param_changes).toBeDefined();
    });

    it('should detect low episode success rate with logic hypothesis', () => {
      const snapshot = makeSnapshot({
        episodes: { total: 20, success_rate: 0.25, trend: 'declining' },
      });
      const diagnoses = service.runRuleBasedDiagnosis(snapshot);
      const epDiag = diagnoses.find((d) => d.dimension === 'episodes');
      expect(epDiag).toBeDefined();
      expect(epDiag!.root_cause).toBe('logic');
      expect(epDiag!.hypotheses[0].type).toBe('logic_extension');
      expect(epDiag!.hypotheses[0].logic_proposal).toBeDefined();
    });

    it('should detect accumulating knowledge gaps', () => {
      const snapshot = makeSnapshot({
        knowledge: { total: 30, gaps_open: 15, gaps_high_impact: 8, extraction_rate: 5 },
      });
      const diagnoses = service.runRuleBasedDiagnosis(snapshot);
      const kDiag = diagnoses.find((d) => d.dimension === 'knowledge');
      expect(kDiag).toBeDefined();
      expect(kDiag!.hypotheses[0].type).toBe('new_stage');
    });

    it('should detect stale intentions', () => {
      const snapshot = makeSnapshot({
        intentions: { active: 3, completion_rate: 0.6, stale_count: 8, avg_duration_ms: 500 },
      });
      const diagnoses = service.runRuleBasedDiagnosis(snapshot);
      const intDiag = diagnoses.find((d) => d.dimension === 'intentions');
      expect(intDiag).toBeDefined();
      expect(intDiag!.hypotheses[0].type).toBe('strategy_change');
    });

    it('should detect stale world model', () => {
      const snapshot = makeSnapshot({
        world_model: { confidence: 0.75, freshness_hours: 50 },
      });
      const diagnoses = service.runRuleBasedDiagnosis(snapshot);
      const wmDiag = diagnoses.find((d) => d.dimension === 'world_model');
      expect(wmDiag).toBeDefined();
      expect(wmDiag!.severity).toBe('high');
    });

    it('should produce param_changes with valid current values', () => {
      const snapshot = makeSnapshot({
        calibration: { ece: 0.3, overconfident: true, sample_size: 30 },
      });
      const diagnoses = service.runRuleBasedDiagnosis(snapshot);
      for (const diag of diagnoses) {
        for (const hyp of diag.hypotheses) {
          if (hyp.param_changes) {
            for (const change of hyp.param_changes) {
              expect(change.key).toBeTruthy();
              expect(typeof change.from).toBe('number');
              expect(typeof change.to).toBe('number');
              expect(change.to).not.toEqual(change.from);
            }
          }
        }
      }
    });
  });
});
