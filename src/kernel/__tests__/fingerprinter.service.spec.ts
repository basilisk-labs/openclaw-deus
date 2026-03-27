import { FingerprinterService } from '../sensory/fingerprinter.service';
import { RawSensoryEvent } from '../sensory/modality.types';

function makeEvent(content: string, timestamp = Date.now()): RawSensoryEvent {
  return {
    content,
    source: 'test',
    timestamp,
    byte_length: Buffer.byteLength(content),
  };
}

describe('FingerprinterService', () => {
  let service: FingerprinterService;

  beforeEach(() => {
    service = new FingerprinterService();
  });

  describe('symbol_density', () => {
    it('should have low symbol_density for plain text', () => {
      const fp = service.fingerprint(makeEvent('hello world this is plain text'));
      expect(fp.symbol_density).toBeLessThan(0.05);
    });

    it('should have high symbol_density for code', () => {
      const fp = service.fingerprint(makeEvent('function foo() { return bar[0] + baz(x, y); }'));
      expect(fp.symbol_density).toBeGreaterThan(0.1);
    });
  });

  describe('numeric_ratio', () => {
    it('should have high numeric_ratio for number-heavy text', () => {
      const fp = service.fingerprint(makeEvent('123 456 789 101112 131415'));
      expect(fp.numeric_ratio).toBeGreaterThan(0.3);
    });

    it('should have low numeric_ratio for pure text', () => {
      const fp = service.fingerprint(makeEvent('the quick brown fox jumps over the lazy dog'));
      expect(fp.numeric_ratio).toBe(0);
    });
  });

  describe('char_entropy', () => {
    it('should compute higher entropy for diverse text than for repetitive text', () => {
      const diverse = service.fingerprint(makeEvent(
        'The quick brown fox jumps over the lazy dog! 123 @#$ symbols here.',
      ));
      const repetitive = service.fingerprint(makeEvent('aaaaaaaaaaaaaaaaaa'));
      expect(diverse.char_entropy).toBeGreaterThan(repetitive.char_entropy);
    });

    it('should have entropy > 0 for non-empty text', () => {
      const fp = service.fingerprint(makeEvent('hello'));
      expect(fp.char_entropy).toBeGreaterThan(0);
    });
  });

  describe('unique_token_ratio', () => {
    it('should be 1.0 for all unique words', () => {
      const fp = service.fingerprint(makeEvent('alpha beta gamma delta epsilon'));
      expect(fp.unique_token_ratio).toBe(1);
    });

    it('should be less than 1.0 for repeated words', () => {
      const fp = service.fingerprint(makeEvent('hello hello hello world world'));
      expect(fp.unique_token_ratio).toBeLessThan(1);
    });
  });

  describe('line structure', () => {
    it('should count lines correctly', () => {
      const fp = service.fingerprint(makeEvent('line1\nline2\nline3'));
      expect(fp.line_count).toBe(3);
    });

    it('should compute avg_line_length', () => {
      const fp = service.fingerprint(makeEvent('aaaa\nbb'));
      // "aaaa" = 4, "bb" = 2 => avg = 3
      expect(fp.avg_line_length).toBe(3);
    });
  });

  describe('toVector()', () => {
    it('should return exactly 11 elements', () => {
      const fp = service.fingerprint(makeEvent('some test content here'));
      const vec = service.toVector(fp);
      expect(vec).toHaveLength(11);
    });

    it('should have all elements in approximate [0, 1] range', () => {
      const fp = service.fingerprint(makeEvent('function test() { return 42; }'));
      const vec = service.toVector(fp);
      for (const v of vec) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1.5); // some slack for normalization edge cases
      }
    });

    it('should produce different vectors for different content types', () => {
      const codeFp = service.fingerprint(makeEvent('const x = { a: 1, b: [2, 3] };'));
      const textFp = service.fingerprint(makeEvent('the quick brown fox jumps over the lazy dog'));
      const codeVec = service.toVector(codeFp);
      const textVec = service.toVector(textFp);

      // They should differ on at least symbol_density (index 2)
      expect(codeVec[2]).not.toBeCloseTo(textVec[2], 1);
    });
  });

  describe('temporal features', () => {
    it('should compute time_since_last as 0 for first event', () => {
      const fp = service.fingerprint(makeEvent('first', 1000));
      expect(fp.time_since_last).toBe(0);
    });

    it('should compute time_since_last from previous event', () => {
      service.fingerprint(makeEvent('first', 1000));
      const fp = service.fingerprint(makeEvent('second', 2000));
      expect(fp.time_since_last).toBe(1000);
    });

    it('should compute burst_rate from recent timestamps', () => {
      const now = Date.now();
      service.fingerprint(makeEvent('a', now - 1000));
      service.fingerprint(makeEvent('b', now - 500));
      const fp = service.fingerprint(makeEvent('c', now));
      expect(fp.burst_rate).toBe(3); // all within 5 seconds
    });
  });
});
