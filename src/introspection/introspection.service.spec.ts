import { IntrospectionService } from './introspection.service';
import { Belief } from '../common/types/belief.types';
import { CognitiveConfigService } from '../cognitive/cognitive-config.service';
import { mockCognitiveConfig } from '../__mocks__/cognitive-config.mock';

function makeBelief(confidence: number): Belief {
  return {
    belief_id: 'B1', content: 'test', confidence, evidence_set: [],
    source_type: 'inference', belief_class: 'operational', decay_mode: 'normal',
    confidence_floor: 0.5, review_threshold: 0.7, context_scope: 'test',
    status: 'active', drift_history: [],
    timestamp_created: '', timestamp_updated: '',
  };
}

describe('IntrospectionService (pure methods)', () => {
  let service: IntrospectionService;

  beforeEach(() => {
    // Access pure methods with config injected
    service = Object.create(IntrospectionService.prototype);
    (service as any).config = mockCognitiveConfig;
  });

  describe('calculateCoherence', () => {
    it('should return 0.5 for empty beliefs', () => {
      expect(service.calculateCoherence([], 0)).toBe(0.5);
    });

    it('should return high score for confident beliefs with no contradictions', () => {
      const beliefs = [makeBelief(0.95), makeBelief(0.9), makeBelief(0.85)];
      const score = service.calculateCoherence(beliefs, 0);
      expect(score).toBeGreaterThan(0.7);
    });

    it('should reduce score for contradictions', () => {
      const beliefs = [makeBelief(0.9)];
      const withoutContr = service.calculateCoherence(beliefs, 0);
      const withContr = service.calculateCoherence(beliefs, 3);
      expect(withContr).toBeLessThan(withoutContr);
    });

    it('should reduce score for low-confidence beliefs', () => {
      const highConf = [makeBelief(0.95), makeBelief(0.9)];
      const lowConf = [makeBelief(0.3), makeBelief(0.2)];
      expect(service.calculateCoherence(highConf, 0)).toBeGreaterThan(service.calculateCoherence(lowConf, 0));
    });
  });

  describe('classifyPosture', () => {
    it('should be stable for high coherence and no low-confidence beliefs', () => {
      expect(service.classifyPosture(0.9, 0)).toBe('stable');
    });

    it('should be review for moderate coherence', () => {
      expect(service.classifyPosture(0.82, 1)).toBe('review');
    });

    it('should be repair for low coherence', () => {
      expect(service.classifyPosture(0.5, 5)).toBe('repair');
    });

    it('should not be stable if there are low-confidence beliefs', () => {
      expect(service.classifyPosture(0.9, 1)).not.toBe('stable');
    });
  });
});
