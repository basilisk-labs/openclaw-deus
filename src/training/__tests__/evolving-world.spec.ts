import { EvolvingWorld } from '../evolving-world';
import { DevelopmentalSnapshot, DevelopmentalStage } from '../../kernel/developmental-metrics.service';

function makeSnapshot(overrides: Partial<DevelopmentalSnapshot> = {}): DevelopmentalSnapshot {
  return {
    tick: 100,
    stage: 'sensory' as DevelopmentalStage,
    stage_confidence: 0.5,
    cognitive: {
      dimension_growth_rate: 0.1,
      abstraction_count: 0,
      schema_complexity: 0.3,
      concept_space_coverage: 0.05,
      knowledge_retention: 0.8,
      cross_modal_binding_strength: 0.2,
    },
    vitality: {
      sleep_regularity: 0.5,
      energy_efficiency: 0.1,
      recovery_quality: 0.7,
      fatigue_resilience: 0.6,
      exploration_budget: 0.4,
    },
    affect: {
      valence_trend: 0,
      cortisol_baseline: 0.3,
      curiosity_sustain: 0.5,
      pain_resolution_rate: 0.3,
      emotional_range: 0.4,
      mode_diversity: 0.5,
    },
    agency: {
      action_diversity: 0.5,
      target_novelty_preference: 0.3,
      explore_exploit_shift: 0,
      help_seeking_frequency: 0.2,
      prediction_action_coupling: 0.3,
      consequence_learning: 0.5,
    },
    world_model: {
      object_coverage: 0.3,
      property_accuracy: 0.2,
      generalization_rate: 0.1,
      prediction_precision: 0.3,
      causal_understanding: 0.2,
      physics_model: 0.1,
    },
    overall_health: 0.3,
    ...overrides,
  };
}

describe('EvolvingWorld', () => {
  let world: EvolvingWorld;

  beforeEach(() => {
    world = new EvolvingWorld();
  });

  describe('initialization', () => {
    it('should start at level 0', () => {
      expect(world.getLevel()).toBe(0);
    });

    it('should start in детская комната', () => {
      expect(world.getState().location).toBe('детская комната');
    });

    it('should have 5 objects at level 0', () => {
      expect(world.getObjectNames().length).toBe(5);
    });

    it('should have mama present at level 0', () => {
      expect(world.getState().mamaPresent).toBe(true);
    });

    it('should have level history', () => {
      const hist = world.getLevelHistory();
      expect(hist).toHaveLength(1);
      expect(hist[0]).toEqual({ level: 0, tick: 0 });
    });
  });

  describe('tick()', () => {
    it('should generate events on tick', () => {
      const events = world.tick();
      expect(events.length).toBeGreaterThan(0);
    });

    it('should increment tick counter', () => {
      world.tick();
      expect(world.getState().tick).toBe(1);
    });

    it('should drain child energy', () => {
      const before = world.getState().childEnergy;
      world.tick();
      expect(world.getState().childEnergy).toBeLessThan(before);
    });

    it('should generate events with valid structure', () => {
      const events = world.tick();
      for (const e of events) {
        expect(e.content).toBeDefined();
        expect(typeof e.content).toBe('string');
        expect(e.source).toBeDefined();
        expect(e.timestamp).toBeDefined();
        expect(e.byte_length).toBeGreaterThan(0);
      }
    });
  });

  describe('progression', () => {
    it('should NOT progress when metrics are low', () => {
      const snap = makeSnapshot({ world_model: { ...makeSnapshot().world_model, property_accuracy: 0.1 } });
      const progressed = world.checkProgression(snap);
      expect(progressed).toBe(false);
      expect(world.getLevel()).toBe(0);
    });

    it('should progress 0→1 when accuracy > 40% and coverage > 10%', () => {
      const snap = makeSnapshot({
        world_model: { ...makeSnapshot().world_model, property_accuracy: 0.5 },
        cognitive: { ...makeSnapshot().cognitive, concept_space_coverage: 0.15 },
      });
      const progressed = world.checkProgression(snap);
      expect(progressed).toBe(true);
      expect(world.getLevel()).toBe(1);
    });

    it('should progress 1→2 when accuracy > 50% and abstractions >= 2', () => {
      // First advance to level 1
      const snap1 = makeSnapshot({
        world_model: { ...makeSnapshot().world_model, property_accuracy: 0.5 },
        cognitive: { ...makeSnapshot().cognitive, concept_space_coverage: 0.15 },
      });
      world.checkProgression(snap1);
      expect(world.getLevel()).toBe(1);

      // Now try to advance to level 2
      const snap2 = makeSnapshot({
        world_model: { ...makeSnapshot().world_model, property_accuracy: 0.55 },
        cognitive: { ...makeSnapshot().cognitive, abstraction_count: 3 },
      });
      const progressed = world.checkProgression(snap2);
      expect(progressed).toBe(true);
      expect(world.getLevel()).toBe(2);
    });

    it('should record level history on progression', () => {
      const snap = makeSnapshot({
        world_model: { ...makeSnapshot().world_model, property_accuracy: 0.5 },
        cognitive: { ...makeSnapshot().cognitive, concept_space_coverage: 0.15 },
      });
      // Run some ticks first
      for (let i = 0; i < 10; i++) world.tick();
      world.checkProgression(snap);

      const hist = world.getLevelHistory();
      expect(hist.length).toBe(2);
      expect(hist[1].level).toBe(1);
    });

    it('should expand available objects after progression', () => {
      const objectsBefore = world.getObjectNames().length;

      const snap = makeSnapshot({
        world_model: { ...makeSnapshot().world_model, property_accuracy: 0.5 },
        cognitive: { ...makeSnapshot().cognitive, concept_space_coverage: 0.15 },
      });
      world.checkProgression(snap);

      // Level 1 has more objects available across locations
      // The current location will have objects from one of the level 1 locations
      expect(world.getObjectNames().length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('childAction()', () => {
    it('should return consequences for touch', () => {
      const events = world.childAction('touch', world.getObjectNames()[0]);
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].content).toContain('Потрогал');
    });

    it('should return consequences for push', () => {
      const events = world.childAction('push', world.getObjectNames()[0]);
      expect(events.length).toBeGreaterThan(0);
    });

    it('should return consequences for drop', () => {
      const events = world.childAction('drop', world.getObjectNames()[0]);
      expect(events.length).toBeGreaterThan(0);
    });

    it('should handle unknown target', () => {
      const events = world.childAction('touch', 'несуществующий');
      expect(events.length).toBe(1);
      expect(events[0].content).toContain('Ничего не произошло');
    });

    it('should return physics results for put_in_water', () => {
      const events = world.childAction('put_in_water', world.getObjectNames()[0]);
      expect(events.length).toBe(1);
      expect(events[0].content).toMatch(/Утонул|Плавает/);
    });
  });

  describe('getGroundTruth()', () => {
    it('should return properties for all current objects', () => {
      const truth = world.getGroundTruth();
      expect(truth.length).toBe(world.getObjectNames().length);
      for (const obj of truth) {
        expect(obj.name).toBeDefined();
        expect(obj.properties).toBeDefined();
        expect(Object.keys(obj.properties).length).toBeGreaterThan(0);
      }
    });
  });

  describe('getAvailableActions()', () => {
    it('should return 6 actions', () => {
      expect(world.getAvailableActions()).toEqual([
        'touch', 'push', 'drop', 'shake', 'look_closely', 'put_in_water',
      ]);
    });
  });
});
