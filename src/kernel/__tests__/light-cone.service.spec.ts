import { LightConeService } from '../light-cone.service';

describe('LightConeService', () => {
  let service: LightConeService;

  beforeEach(() => {
    service = new LightConeService();
  });

  describe('fastTick() — schedule flags', () => {
    it('should not trigger medium on first tick', () => {
      const flags = service.fastTick();
      expect(flags.shouldMedium).toBe(false);
    });

    it('should trigger medium after cadence.medium ticks', () => {
      let flags: ReturnType<LightConeService['fastTick']>;
      for (let i = 0; i < service.cadence.medium; i++) {
        flags = service.fastTick();
      }
      expect(flags!.shouldMedium).toBe(true);
    });

    it('should trigger slow after cadence.slow ticks', () => {
      let flags: ReturnType<LightConeService['fastTick']>;
      for (let i = 0; i < service.cadence.slow; i++) {
        flags = service.fastTick();
      }
      expect(flags!.shouldSlow).toBe(true);
    });

    it('should trigger global after cadence.global ticks', () => {
      let flags: ReturnType<LightConeService['fastTick']>;
      for (let i = 0; i < service.cadence.global; i++) {
        flags = service.fastTick();
      }
      expect(flags!.shouldGlobal).toBe(true);
    });

    it('should trigger deep after cadence.deep ticks', () => {
      let flags: ReturnType<LightConeService['fastTick']>;
      for (let i = 0; i < service.cadence.deep; i++) {
        flags = service.fastTick();
      }
      expect(flags!.shouldDeep).toBe(true);
    });

    it('should increment tick counter', () => {
      service.fastTick();
      service.fastTick();
      expect(service.getTick()).toBe(2);
    });
  });

  describe('cadence counters reset', () => {
    it('should not re-trigger medium until next cadence after markMedium', () => {
      for (let i = 0; i < service.cadence.medium; i++) service.fastTick();
      service.markMedium();

      // Next tick should not trigger medium
      const flags = service.fastTick();
      expect(flags.shouldMedium).toBe(false);
    });

    it('should re-trigger medium after another cadence.medium ticks', () => {
      for (let i = 0; i < service.cadence.medium; i++) service.fastTick();
      service.markMedium();

      let flags: ReturnType<LightConeService['fastTick']>;
      for (let i = 0; i < service.cadence.medium; i++) {
        flags = service.fastTick();
      }
      expect(flags!.shouldMedium).toBe(true);
    });
  });

  describe('activateHot()', () => {
    it('should create a new hot trace', () => {
      service.activateHot('T1', 'hello', 0.5);
      expect(service.getHotTraceCount()).toBe(1);
    });

    it('should update existing trace weight and freshness on re-activation', () => {
      service.activateHot('T1', 'hello', 0.5);
      service.activateHot('T1', 'hello', 0.5);
      const traces = service.getHotTraces(1);
      expect(traces[0].activationCount).toBe(2);
      expect(traces[0].freshness).toBe(1.0); // reset to 1 on re-activation
    });

    it('should boost weight on re-activation (asymptotic toward 1)', () => {
      service.activateHot('T1', 'hello', 0.3);
      const beforeTraces = service.getHotTraces(1);
      const weightBefore = beforeTraces[0].weight;
      service.activateHot('T1', 'hello', 0.3);
      const afterTraces = service.getHotTraces(1);
      expect(afterTraces[0].weight).toBeGreaterThan(weightBefore);
    });
  });

  describe('spreadHot()', () => {
    it('should activate neighbors that are already hot', () => {
      service.activateHot('src', 'source', 0.8);
      service.activateHot('n1', 'neighbor', 0.2);

      const activated = service.spreadHot('src', [
        { traceId: 'n1', edgeWeight: 0.5 },
      ]);
      expect(activated).toContain('n1');
    });

    it('should not activate neighbors below boost threshold', () => {
      service.activateHot('src', 'source', 0.8);
      service.activateHot('n1', 'neighbor', 0.2);

      const activated = service.spreadHot('src', [
        { traceId: 'n1', edgeWeight: 0.001 }, // too weak
      ]);
      expect(activated).toHaveLength(0);
    });

    it('should return empty if source weight is too low', () => {
      service.activateHot('src', 'source', 0.05);
      service.activateHot('n1', 'neighbor', 0.5);

      const activated = service.spreadHot('src', [
        { traceId: 'n1', edgeWeight: 0.5 },
      ]);
      expect(activated).toHaveLength(0);
    });

    it('should queue edge updates for batch DB write', () => {
      service.activateHot('src', 'source', 0.8);
      service.activateHot('n1', 'neighbor', 0.2);
      service.spreadHot('src', [{ traceId: 'n1', edgeWeight: 0.5 }]);

      const flushed = service.flushWrites();
      expect(flushed.edgeUpdates.length).toBeGreaterThan(0);
      expect(flushed.edgeUpdates[0].from).toBe('src');
      expect(flushed.edgeUpdates[0].to).toBe('n1');
    });

    it('should return empty for non-existent source', () => {
      const activated = service.spreadHot('nonexistent', []);
      expect(activated).toHaveLength(0);
    });
  });

  describe('getHotTraces()', () => {
    it('should return traces sorted by weight * freshness descending', () => {
      service.activateHot('T1', 'low', 0.2);
      service.activateHot('T2', 'high', 0.9);
      service.activateHot('T3', 'mid', 0.5);

      const traces = service.getHotTraces(10);
      expect(traces[0].traceId).toBe('T2');
      expect(traces[traces.length - 1].traceId).toBe('T1');
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 20; i++) {
        service.activateHot(`T${i}`, `trace ${i}`, 0.5);
      }
      expect(service.getHotTraces(5)).toHaveLength(5);
    });
  });

  describe('flushWrites()', () => {
    it('should return and clear pending writes', () => {
      service.queueWrite({ table: 'trace', operation: 'create', data: { content: 'test' } });
      service.queueWrite({ table: 'trace', operation: 'update', data: { weight: 0.5 } });

      const first = service.flushWrites();
      expect(first.writes).toHaveLength(2);

      const second = service.flushWrites();
      expect(second.writes).toHaveLength(0);
    });

    it('should clear edge updates after flush', () => {
      service.activateHot('src', 'source', 0.8);
      service.activateHot('n1', 'neighbor', 0.5);
      service.spreadHot('src', [{ traceId: 'n1', edgeWeight: 0.5 }]);

      service.flushWrites();
      const second = service.flushWrites();
      expect(second.edgeUpdates).toHaveLength(0);
    });
  });

  describe('loadFromDb()', () => {
    it('should populate hot memory from DB traces', () => {
      service.loadFromDb([
        { traceId: 'T1', content: 'hello', weight: 0.5, emotionalCharge: 0.1 },
        { traceId: 'T2', content: 'world', weight: 0.3, emotionalCharge: 0 },
      ]);
      expect(service.getHotTraceCount()).toBe(2);
    });

    it('should not overwrite existing hot traces', () => {
      service.activateHot('T1', 'original', 0.9);
      service.loadFromDb([
        { traceId: 'T1', content: 'from db', weight: 0.1, emotionalCharge: 0 },
      ]);
      const traces = service.getHotTraces(1);
      expect(traces[0].weight).toBeCloseTo(0.9, 1); // original weight preserved
    });
  });

  describe('hot memory cap at 200', () => {
    it('should evict lowest-weight traces when exceeding 200', () => {
      const traces = Array.from({ length: 250 }, (_, i) => ({
        traceId: `T${i}`,
        content: `trace ${i}`,
        weight: i / 250, // weight increases with index
        emotionalCharge: 0,
      }));
      service.loadFromDb(traces);
      expect(service.getHotTraceCount()).toBeLessThanOrEqual(200);
    });

    it('should keep highest-weight traces after eviction', () => {
      const traces = Array.from({ length: 250 }, (_, i) => ({
        traceId: `T${i}`,
        content: `trace ${i}`,
        weight: i / 250,
        emotionalCharge: 0,
      }));
      service.loadFromDb(traces);
      const hot = service.getHotTraces(1);
      // The top trace should be one of the high-weight ones
      expect(hot[0].weight).toBeGreaterThan(0.5);
    });
  });

  describe('fastTick() — trace decay', () => {
    it('should micro-decay hot trace weights on each tick', () => {
      service.activateHot('T1', 'hello', 0.5);
      const before = service.getHotTraces(1)[0].weight;
      service.fastTick();
      const after = service.getHotTraces(1)[0].weight;
      expect(after).toBeLessThan(before);
    });

    it('should remove traces that decay below threshold', () => {
      service.activateHot('T1', 'fading', 0.02);
      // 0.999^N decay factor: need ~3000 ticks for 0.02 * 0.999^3000 < 0.01
      for (let i = 0; i < 3000; i++) service.fastTick();
      expect(service.getHotTraceCount()).toBe(0);
    });
  });
});
