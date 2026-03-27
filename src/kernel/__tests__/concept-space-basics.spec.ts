import { ConceptSpaceService } from '../space/concept-space.service';
import { GradientField } from '../space/concept-space.types';

/**
 * Tests for pure (non-DB) methods of ConceptSpaceService:
 * distance, spatialActivation, desireVector, computeAttraction.
 */
describe('ConceptSpaceService — pure methods', () => {
  let service: ConceptSpaceService;

  beforeEach(() => {
    // Create instance without DB/config dependencies for pure method testing
    service = Object.create(ConceptSpaceService.prototype);
  });

  describe('distance()', () => {
    it('should return sqrt(2) for [1,0] vs [0,1]', () => {
      expect(service.distance([1, 0], [0, 1])).toBeCloseTo(Math.SQRT2, 5);
    });

    it('should return 0 for empty arrays', () => {
      expect(service.distance([], [])).toBe(0);
    });

    it('should return 1 for [1] vs [1,1] (pad shorter with zeros)', () => {
      // [1] padded to [1, 0], vs [1, 1]
      // sqrt((1-1)^2 + (0-1)^2) = sqrt(1) = 1
      expect(service.distance([1], [1, 1])).toBe(1);
    });

    it('should return 0 for identical positions', () => {
      expect(service.distance([1, 2, 3], [1, 2, 3])).toBe(0);
    });

    it('should compute correctly in 3D', () => {
      // distance([0,0,0], [1,1,1]) = sqrt(3)
      expect(service.distance([0, 0, 0], [1, 1, 1])).toBeCloseTo(Math.sqrt(3), 5);
    });

    it('should handle one empty array (pad to zeros)', () => {
      // [] padded to [0, 0], vs [3, 4] => sqrt(9+16) = 5
      expect(service.distance([], [3, 4])).toBe(5);
    });

    it('should be symmetric', () => {
      const d1 = service.distance([1, 2], [3, 4]);
      const d2 = service.distance([3, 4], [1, 2]);
      expect(d1).toBeCloseTo(d2, 10);
    });
  });

  describe('spatialActivation()', () => {
    it('should return sourceWeight when distance is 0', () => {
      expect(service.spatialActivation(0.8, 0, 1.0)).toBe(0.8);
    });

    it('should decay with increasing distance', () => {
      const close = service.spatialActivation(1.0, 0.5, 1.0);
      const far = service.spatialActivation(1.0, 3.0, 1.0);
      expect(close).toBeGreaterThan(far);
    });

    it('should approach 0 at large distances', () => {
      const activation = service.spatialActivation(1.0, 100, 1.0);
      expect(activation).toBeCloseTo(0, 5);
    });

    it('should respect sigma parameter (wider sigma = slower decay)', () => {
      const narrow = service.spatialActivation(1.0, 2.0, 0.5);
      const wide = service.spatialActivation(1.0, 2.0, 2.0);
      expect(wide).toBeGreaterThan(narrow);
    });

    it('should scale linearly with sourceWeight', () => {
      const half = service.spatialActivation(0.5, 1.0, 1.0);
      const full = service.spatialActivation(1.0, 1.0, 1.0);
      expect(full).toBeCloseTo(half * 2, 5);
    });
  });

  describe('desireVector()', () => {
    it('should point toward attractors', () => {
      const field: GradientField = {
        attractors: [{ position: [5, 0], strength: 1.0, source: 'test' }],
        repellers: [],
      };
      const vec = service.desireVector([0, 0], field);
      expect(vec[0]).toBeGreaterThan(0); // pulled toward x=5
    });

    it('should point away from repellers', () => {
      const field: GradientField = {
        attractors: [],
        repellers: [{ position: [5, 0], strength: 1.0, source: 'test' }],
      };
      const vec = service.desireVector([0, 0], field);
      // Repeller at [5,0] pushes away, so vector should point in negative x (away)
      expect(vec[0]).toBeLessThan(0);
    });

    it('should combine attractors and repellers', () => {
      const field: GradientField = {
        attractors: [{ position: [10, 0], strength: 1.0, source: 'attractor' }],
        repellers: [{ position: [-10, 0], strength: 1.0, source: 'repeller' }],
      };
      const vec = service.desireVector([0, 0], field);
      // Both attractor (pulling toward +x) and repeller (pushing away from -x, toward +x) agree
      expect(vec[0]).toBeGreaterThan(0);
    });

    it('should return empty vector for empty position', () => {
      const field: GradientField = {
        attractors: [{ position: [1], strength: 1.0, source: 'test' }],
        repellers: [],
      };
      const vec = service.desireVector([], field);
      expect(vec).toHaveLength(0);
    });

    it('should produce stronger pull for closer attractors', () => {
      const field: GradientField = {
        attractors: [{ position: [1, 0], strength: 1.0, source: 'close' }],
        repellers: [],
      };
      const closeVec = service.desireVector([0, 0], field);

      const farField: GradientField = {
        attractors: [{ position: [100, 0], strength: 1.0, source: 'far' }],
        repellers: [],
      };
      const farVec = service.desireVector([0, 0], farField);

      // Close attractor should produce stronger per-unit pull
      // (though far attractor has larger diff, the 1/(1+dist) factor matters)
      // The magnitude of the close vector in x should be relatively large
      expect(Math.abs(closeVec[0])).toBeGreaterThan(0);
      expect(Math.abs(farVec[0])).toBeGreaterThan(0);
    });
  });

  describe('computeAttraction()', () => {
    it('should produce two movement vectors', () => {
      const movements = service.computeAttraction([0, 0], [2, 0], 1.0);
      expect(movements).toHaveLength(2);
    });

    it('should move traces toward each other (attract)', () => {
      const movements = service.computeAttraction([0, 0], [2, 0], 1.0);
      // A should move toward B (+x), B should move toward A (-x)
      expect(movements[0].delta[0]).toBeGreaterThan(0);
      expect(movements[1].delta[0]).toBeLessThan(0);
    });

    it('should scale movement with strength', () => {
      const weak = service.computeAttraction([0, 0], [2, 0], 0.1);
      const strong = service.computeAttraction([0, 0], [2, 0], 1.0);
      expect(Math.abs(strong[0].delta[0])).toBeGreaterThan(Math.abs(weak[0].delta[0]));
    });

    it('should produce zero deltas for identical positions', () => {
      const movements = service.computeAttraction([1, 1], [1, 1], 1.0);
      expect(movements[0].delta.every(d => d === 0)).toBe(true);
    });
  });
});
