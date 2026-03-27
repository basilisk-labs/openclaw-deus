import { AttentionService } from '../sensory/attention.service';

describe('AttentionService', () => {
  let service: AttentionService;

  beforeEach(() => {
    service = new AttentionService();
  });

  describe('attend() — softmax distribution', () => {
    it('should return a distribution summing to approximately 1.0', () => {
      const dist = service.attend(4);
      const sum = dist.reduce((s, v) => s + v, 0);
      expect(sum).toBeCloseTo(1.0, 2);
    });

    it('should return correct number of weights matching modality count', () => {
      const dist = service.attend(5);
      expect(dist).toHaveLength(5);
    });

    it('should produce uniform-ish distribution for fresh service', () => {
      const dist = service.attend(4);
      // With all weights at 0, softmax produces uniform
      for (const v of dist) {
        expect(v).toBeCloseTo(0.25, 1);
      }
    });

    it('should handle single modality', () => {
      const dist = service.attend(1);
      expect(dist).toHaveLength(1);
      expect(dist[0]).toBeCloseTo(1.0, 2);
    });

    it('should grow weights array when modality count increases', () => {
      service.attend(3);
      const dist = service.attend(5);
      expect(dist).toHaveLength(5);
    });
  });

  describe('capture() — involuntary attention override', () => {
    it('should bias next attend() toward captured modality', () => {
      service.attend(4);
      service.capture(2); // capture modality #2

      const dist = service.attend(4);
      const capturedWeight = dist[2];
      const otherWeights = dist.filter((_, i) => i !== 2);

      // Captured modality should have much higher weight
      expect(capturedWeight).toBeGreaterThan(Math.max(...otherWeights));
    });

    it('should be one-shot: capture only affects next attend()', () => {
      service.attend(4);
      service.capture(1);
      service.attend(4); // consumes capture

      const dist = service.attend(4); // should be back to normal-ish
      // After consuming capture, distribution should normalize
      const maxDiff = Math.max(...dist) - Math.min(...dist);
      // Not a huge gap like during capture
      expect(maxDiff).toBeLessThan(0.8);
    });

    it('should reset focus fatigue on capture', () => {
      // Build up fatigue on modality 0
      for (let i = 0; i < 10; i++) service.attend(3);

      service.capture(1);
      const report = service.getFocusReport();
      expect(report.focus_durations.every(d => d === 0)).toBe(true);
    });
  });

  describe('reportErrors() + attend() — weight updates', () => {
    it('should shift attention away from high-error modalities', () => {
      // First attend to establish baseline
      service.attend(3);

      // Report: modality 0 has high error, modality 2 has low error
      service.reportErrors([0.9, 0.5, 0.1]);

      // After update, attend again
      const dist = service.attend(3);
      // Modality 2 (low error) should gain relative attention
      // Modality 0 (high error) should lose
      // This may take several rounds; check direction at least
      const initial = service.attend(3);
      service.reportErrors([0.9, 0.5, 0.01]);
      const updated = service.attend(3);

      // The low-error modality should trend higher over iterations
      // Do multiple rounds to see the effect
      for (let i = 0; i < 20; i++) {
        service.attend(3);
        service.reportErrors([0.9, 0.5, 0.01]);
      }
      const final = service.attend(3);
      // Modality 2 should have gained attention
      expect(final[2]).toBeGreaterThan(final[0]);
    });

    it('should not crash when error array is shorter than attention', () => {
      service.attend(5);
      // Should not throw
      service.reportErrors([0.5, 0.3]);
    });
  });

  describe('focus fatigue', () => {
    it('should reduce score for sustained attention on one modality', () => {
      // First attend
      const first = service.attend(3);
      const initialMax = Math.max(...first);

      // Sustain attention for many rounds (same modality keeps winning)
      for (let i = 0; i < 30; i++) {
        service.attend(3);
      }

      const later = service.attend(3);
      const maxIdx = first.indexOf(initialMax);

      // The previously-dominant modality should have lost some weight due to fatigue
      // OR other modalities should have gained relative weight
      // Check that distribution has shifted (not identical to first)
      const sumOfDifferences = first.reduce((s, v, i) => s + Math.abs(v - later[i]), 0);
      expect(sumOfDifferences).toBeGreaterThan(0.001);
    });
  });

  describe('getAttentionLevel()', () => {
    it('should return value from last attend() call', () => {
      const dist = service.attend(3);
      expect(service.getAttentionLevel(0)).toBe(dist[0]);
      expect(service.getAttentionLevel(1)).toBe(dist[1]);
      expect(service.getAttentionLevel(2)).toBe(dist[2]);
    });

    it('should return 0.5 for unknown modality', () => {
      service.attend(3);
      expect(service.getAttentionLevel(99)).toBe(0.5);
    });

    it('should return 0.5 before any attend() call', () => {
      expect(service.getAttentionLevel(0)).toBe(0.5);
    });
  });

  describe('getFocusReport()', () => {
    it('should return focused_modality as index of highest attention', () => {
      service.attend(3);
      service.capture(2);
      service.attend(3);
      const report = service.getFocusReport();
      expect(report.focused_modality).toBe(2);
    });

    it('should return attention_distribution as a copy', () => {
      const dist = service.attend(3);
      const report = service.getFocusReport();
      expect(report.attention_distribution).toEqual(dist);
      // Should be a copy, not the same reference
      expect(report.attention_distribution).not.toBe(dist);
    });
  });
});
