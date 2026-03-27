import { BenchmarkService } from '../benchmark.service';

describe('BenchmarkService', () => {
  let service: BenchmarkService;

  beforeEach(() => {
    service = Object.create(BenchmarkService.prototype);
    (service as any).db = { create: jest.fn().mockResolvedValue({ isOk: () => true, value: {} }) };
    (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  });

  describe('getScenarios', () => {
    it('should return 8 built-in scenarios', () => {
      const scenarios = service.getScenarios();
      expect(scenarios.length).toBe(8);
    });

    it('should cover all categories', () => {
      const scenarios = service.getScenarios();
      const categories = new Set(scenarios.map((s) => s.category));
      expect(categories.has('extraction')).toBe(true);
      expect(categories.has('coherence')).toBe(true);
      expect(categories.has('deliberation')).toBe(true);
      expect(categories.has('knowledge')).toBe(true);
      expect(categories.has('integration')).toBe(true);
    });

    it('should have unique IDs', () => {
      const scenarios = service.getScenarios();
      const ids = scenarios.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should have non-empty expectations', () => {
      const scenarios = service.getScenarios();
      for (const s of scenarios) {
        expect(s.expectations).toBeDefined();
        expect(s.name.length).toBeGreaterThan(0);
      }
    });

    it('should return a defensive copy', () => {
      const a = service.getScenarios();
      const b = service.getScenarios();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe('runScenario (error handling)', () => {
    it('should catch errors and mark scenario as failed', async () => {
      (service as any).pipeline = {
        processMessage: jest.fn().mockRejectedValue(new Error('boom')),
      };
      const scenario = service.getScenarios()[0]; // extraction
      const result = await service.runScenario(scenario);
      expect(result.passed).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
      expect(result.failures[0]).toContain('boom');
    });

    it('should check duration expectations', async () => {
      (service as any).pipeline = {
        processMessage: jest.fn().mockImplementation(() =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ isOk: () => true, value: { intentions_recognized: 1, knowledge_extracted: 1 } }), 50),
          ),
        ),
      };
      const scenario = {
        ...service.getScenarios()[0],
        expectations: { max_duration_ms: 1 }, // impossibly short
      };
      const result = await service.runScenario(scenario);
      expect(result.failures.some((f) => f.includes('Duration'))).toBe(true);
    });
  });
});
