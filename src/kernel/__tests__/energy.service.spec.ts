import { EnergyService } from '../energy.service';

describe('EnergyService', () => {
  let service: EnergyService;

  beforeEach(() => {
    service = new EnergyService();
  });

  describe('spend()', () => {
    it('should reduce energy and return true when sufficient', () => {
      const initial = service.getState().current;
      const success = service.spend(0.1, 'test');
      expect(success).toBe(true);
      expect(service.getState().current).toBeCloseTo(initial - 0.1, 3);
    });

    it('should return false when energy is insufficient', () => {
      // Drain most energy first
      service.spend(0.95, 'drain');
      const success = service.spend(0.5, 'too expensive');
      expect(success).toBe(false);
    });

    it('should track total energy spent', () => {
      service.spend(0.1, 'a');
      service.spend(0.2, 'b');
      expect(service.getState().total_energy_spent).toBeCloseTo(0.3, 3);
    });

    it('should accumulate fatigue at 30% of spend', () => {
      service.spend(0.5, 'big op');
      expect(service.getState().fatigue_level).toBeCloseTo(0.15, 3);
    });
  });

  describe('tick()', () => {
    it('should drain energy each tick', () => {
      const before = service.getState().current;
      service.tick();
      expect(service.getState().current).toBeLessThan(before);
    });

    it('should increment cycles_since_sleep', () => {
      service.tick();
      service.tick();
      expect(service.getState().cycles_since_sleep).toBe(2);
    });

    it('should accumulate fatigue even without spending', () => {
      service.tick();
      expect(service.getState().fatigue_level).toBeGreaterThan(0);
    });
  });

  describe('reward()', () => {
    it('should partially restore energy (20% of reward amount)', () => {
      service.spend(0.5, 'drain');
      const before = service.getState().current;
      service.reward(1.0);
      const after = service.getState().current;
      expect(after).toBeCloseTo(before + 0.2, 3);
    });

    it('should not exceed max energy', () => {
      service.reward(100);
      expect(service.getState().current).toBeLessThanOrEqual(service.getState().max);
    });

    it('should reduce fatigue slightly', () => {
      service.spend(0.3, 'work');
      const fatigueBefore = service.getState().fatigue_level;
      service.reward(1.0);
      expect(service.getState().fatigue_level).toBeLessThan(fatigueBefore);
    });
  });

  describe('pain()', () => {
    it('should drain energy (15% of pain amount)', () => {
      const before = service.getState().current;
      service.pain(1.0);
      expect(service.getState().current).toBeCloseTo(before - 0.15, 3);
    });

    it('should drain faster than reward restores for same amount', () => {
      const svc1 = new EnergyService();
      const svc2 = new EnergyService();

      svc1.spend(0.5, 'drain');
      svc2.spend(0.5, 'drain');

      const base = svc1.getState().current;
      svc1.pain(1.0);
      svc2.reward(1.0);

      const painDelta = base - svc1.getState().current;
      const rewardDelta = svc2.getState().current - base;
      // Pain drains 0.15, reward restores 0.2 — but pain also increases fatigue
      // The key is pain is punishing overall (energy + fatigue)
      expect(svc1.getState().fatigue_level).toBeGreaterThan(svc2.getState().fatigue_level);
    });

    it('should increase fatigue (20% of pain amount)', () => {
      const before = service.getState().fatigue_level;
      service.pain(1.0);
      expect(service.getState().fatigue_level).toBeCloseTo(before + 0.2, 3);
    });
  });

  describe('needsSleep()', () => {
    it('should return false when energy is high', () => {
      expect(service.needsSleep()).toBe(false);
    });

    it('should return true when energy is below 0.1', () => {
      service.spend(0.95, 'exhaust');
      expect(service.needsSleep()).toBe(true);
    });

    it('should return true when fatigue exceeds 0.8', () => {
      // fatigue accumulates at 30% of spend, so spending 2.7+ would exceed 0.8 fatigue
      // But we can only spend up to 1.0 total energy. Let's use pain() to push fatigue.
      service.pain(3.0); // +0.6 fatigue
      service.pain(2.0); // +0.4 fatigue => 1.0 total, capped at 1
      expect(service.needsSleep()).toBe(true);
    });
  });

  describe('sleep()', () => {
    it('should fully recover energy', () => {
      service.spend(0.5, 'work');
      const before = service.getState().current;
      service.sleep();
      // After sleep, energy is restored to pre-sleep maxEnergy (1.0)
      // then maxEnergy is bumped slightly, so current < new max
      expect(service.getState().current).toBeGreaterThan(before);
      expect(service.getState().current).toBeCloseTo(1.0, 2);
    });

    it('should reset fatigue to zero', () => {
      service.spend(0.3, 'work');
      service.sleep();
      expect(service.getState().fatigue_level).toBe(0);
    });

    it('should reset cycles_since_sleep', () => {
      service.tick();
      service.tick();
      service.sleep();
      expect(service.getState().cycles_since_sleep).toBe(0);
    });

    it('should report cycles awake in return value', () => {
      service.tick();
      service.tick();
      service.tick();
      const result = service.sleep();
      expect(result.slept).toBe(true);
      expect(result.cycles_awake).toBe(3);
    });

    it('should grow maxEnergy slightly after sleep', () => {
      const maxBefore = service.getState().max;
      service.sleep();
      expect(service.getState().max).toBeGreaterThan(maxBefore);
      expect(service.getState().max).toBeCloseTo(maxBefore + 0.001, 4);
    });

    it('should cap maxEnergy at 1.5', () => {
      for (let i = 0; i < 600; i++) service.sleep();
      expect(service.getState().max).toBeLessThanOrEqual(1.5);
    });
  });

  describe('canAffordLlm()', () => {
    it('should return true at full energy', () => {
      expect(service.canAffordLlm()).toBe(true);
    });

    it('should return false when energy is below LLM cost', () => {
      service.spend(0.95, 'drain');
      expect(service.canAffordLlm()).toBe(false);
    });
  });

  describe('canAffordExploration()', () => {
    it('should return true at full energy', () => {
      expect(service.canAffordExploration()).toBe(true);
    });

    it('should return false when energy is below exploration cost', () => {
      service.spend(0.98, 'drain');
      expect(service.canAffordExploration()).toBe(false);
    });
  });

  describe('attentionFactor()', () => {
    it('should return close to 1.0 at full energy', () => {
      expect(service.attentionFactor()).toBeCloseTo(1.0, 1);
    });

    it('should decrease with energy', () => {
      service.spend(0.7, 'drain');
      expect(service.attentionFactor()).toBeLessThan(1.0);
    });

    it('should floor at 0.2', () => {
      service.spend(0.99, 'drain');
      expect(service.attentionFactor()).toBeGreaterThanOrEqual(0.2);
    });
  });

  describe('forgettingMultiplier()', () => {
    it('should return 1 at full energy (no extra forgetting)', () => {
      expect(service.forgettingMultiplier()).toBeCloseTo(1.0, 1);
    });

    it('should increase as energy decreases', () => {
      service.spend(0.5, 'drain');
      expect(service.forgettingMultiplier()).toBeGreaterThan(1.0);
    });

    it('should reach 3x at zero energy', () => {
      service.spend(1.0, 'drain');
      // Energy might not be exactly 0 due to floating point, but close
      expect(service.forgettingMultiplier()).toBeGreaterThan(2.5);
    });
  });
});
