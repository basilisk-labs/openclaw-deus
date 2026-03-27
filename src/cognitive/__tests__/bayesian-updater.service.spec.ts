import { BayesianUpdaterService } from '../bayesian-updater.service';
import { mockCognitiveConfig } from '../../__mocks__/cognitive-config.mock';

function createService(): BayesianUpdaterService {
  return new BayesianUpdaterService(mockCognitiveConfig as any);
}

describe('BayesianUpdaterService', () => {
  let svc: BayesianUpdaterService;

  beforeEach(() => {
    svc = createService();
  });

  // --- betaPosterior ---
  describe('betaPosterior()', () => {
    it('betaPosterior(5, 10) returns calibrated probability near 0.5', () => {
      const result = svc.betaPosterior(5, 10);
      expect(result.point).toBeGreaterThan(0.35);
      expect(result.point).toBeLessThan(0.65);
    });

    it('betaPosterior(9, 10) returns high probability', () => {
      const result = svc.betaPosterior(9, 10);
      expect(result.point).toBeGreaterThan(0.75);
    });

    it('betaPosterior(1, 10) returns low probability', () => {
      const result = svc.betaPosterior(1, 10);
      expect(result.point).toBeLessThan(0.3);
    });

    it('has lower < point < upper', () => {
      const result = svc.betaPosterior(5, 10);
      expect(result.lower).toBeLessThanOrEqual(result.point);
      expect(result.upper).toBeGreaterThanOrEqual(result.point);
    });

    it('all returned calibrated probabilities have point in [0, 1]', () => {
      for (const [s, t] of [[0, 0], [0, 100], [100, 100], [50, 100], [1, 2]]) {
        const r = svc.betaPosterior(s, t);
        expect(r.point).toBeGreaterThanOrEqual(0);
        expect(r.point).toBeLessThanOrEqual(1);
        expect(r.lower).toBeGreaterThanOrEqual(0);
        expect(r.upper).toBeLessThanOrEqual(1);
      }
    });
  });

  // --- updateWithEvidence ---
  describe('updateWithEvidence()', () => {
    it('increases confidence', () => {
      const result = svc.updateWithEvidence(0.5, 'explicit_statement', 3);
      expect(result.point).toBeGreaterThan(0.5);
    });

    it('weak_inference gives smaller boost than explicit_statement', () => {
      const weak = svc.updateWithEvidence(0.5, 'weak_inference', 3);
      const strong = svc.updateWithEvidence(0.5, 'explicit_statement', 3);
      expect(strong.point).toBeGreaterThan(weak.point);
    });

    it('spread decreases with more evidence', () => {
      const few = svc.updateWithEvidence(0.5, 'explicit_statement', 2);
      const many = svc.updateWithEvidence(0.5, 'explicit_statement', 20);
      expect(many.upper - many.lower).toBeLessThan(few.upper - few.lower);
    });
  });

  // --- computePrior ---
  describe('computePrior()', () => {
    it("'axiom' with 0 evidence returns 0.95 (capped)", () => {
      // Base prior for axiom is 1.0 but computePrior caps at 0.95
      expect(svc.computePrior('axiom', 0)).toBe(0.95);
    });

    it("'hypothesis' with 0 evidence returns 0.2", () => {
      expect(svc.computePrior('hypothesis', 0)).toBe(0.2);
    });

    it('evidence > 0 returns higher than base', () => {
      const base = svc.computePrior('hypothesis', 0);
      const boosted = svc.computePrior('hypothesis', 5);
      expect(boosted).toBeGreaterThan(base);
    });
  });

  // --- evidenceWeightedDecayRate ---
  describe('evidenceWeightedDecayRate()', () => {
    it('returns lower rate for more evidence', () => {
      const few = svc.evidenceWeightedDecayRate(0.1, 2);
      const many = svc.evidenceWeightedDecayRate(0.1, 20);
      expect(many).toBeLessThan(few);
    });
  });

  // --- reinforcementBoost ---
  describe('reinforcementBoost()', () => {
    it('is bounded by cap', () => {
      const cap = 0.1; // from mockCognitiveConfig: bayesian.reinforcement_boost_cap
      const boost = svc.reinforcementBoost(0.1, 'explicit_statement');
      expect(boost).toBeLessThanOrEqual(cap + 1e-9);
    });

    it('is larger for higher-quality evidence', () => {
      const weak = svc.reinforcementBoost(0.3, 'weak_inference');
      const strong = svc.reinforcementBoost(0.3, 'explicit_statement');
      expect(strong).toBeGreaterThan(weak);
    });
  });

  // --- contextDecayMultiplier ---
  describe('contextDecayMultiplier()', () => {
    it('returns config value for known scope', () => {
      const tools = svc.contextDecayMultiplier('tools');
      expect(tools).toBe(1.5); // from mock: context_decay.tools = 1.5
    });
  });
});
