import { RipenessService } from './ripeness.service';
import { NormalizedIntent } from '../../common/types/policy.types';
import { WorldModel } from '../../common/types/world-model.types';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';
import { mockCognitiveConfig } from '../../__mocks__/cognitive-config.mock';

function makeIntent(overrides: Partial<NormalizedIntent> = {}): NormalizedIntent {
  return {
    version: 1, goal: 'Deploy the feature', action_type: 'deploy', target: null,
    external: false, destructive: false, confirmed_by_human: true,
    dependencies: [], urgency: 'medium', context_sources: [],
    repo_mutation: false, belief_mutation: false,
    requires_human_confirmation: false, high_impact: false, scope: 'internal',
    ...overrides,
  };
}

function makeWorldModel(): WorldModel {
  return {
    version: 1, generated_at: new Date().toISOString(), workspace_day: '2026-03-25',
    confidence: 0.85,
    self_model: { agency_level: 'L2+', invariants: [], goals: [], review_pressure: 0, active_limitations: [] },
    human_model: { preferences: [], constraints: [], active_requests: [] },
    workspace_model: { active_project: null, mode: 'idle', status: 'idle', repo_dirty: false, memory_freshness_days: 0, introspection_date: null, next_step: null },
    environment_model: { waiting_conditions: [], dependencies: [], open_tensions: [], external_systems: [] },
    action_priors: { hard_blocks: [], preferred_modes: [], active_risks: [] },
    sources: { beliefs: { count: 10 }, memory: { days: 3, latest_day: '2026-03-25' }, logs: { entries: 20 }, pending_beliefs: { count: 0 }, status: { exists: true } },
  };
}

describe('RipenessService', () => {
  let service: RipenessService;

  beforeEach(() => {
    service = new RipenessService(mockCognitiveConfig as CognitiveConfigService);
  });

  describe('score', () => {
    it('should return score between 0 and 1', () => {
      const result = service.score(makeIntent(), makeWorldModel());
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('should classify ready for high-score intents', () => {
      const result = service.score(makeIntent(), makeWorldModel());
      expect(['ready', 'soon']).toContain(result.class);
    });

    it('should classify blocked for empty goal', () => {
      const result = service.score(makeIntent({ goal: '' }), null);
      expect(result.class).toBe('blocked');
    });

    it('should add blocker for missing goal', () => {
      const result = service.score(makeIntent({ goal: '' }), makeWorldModel());
      expect(result.blockers).toContain('no_goal_specified');
      expect(result.class).toBe('blocked');
    });

    it('should penalize missing preconditions', () => {
      const withDeps = service.score(makeIntent({ dependencies: ['dep1', 'dep2'] }), makeWorldModel());
      const withoutDeps = service.score(makeIntent({ dependencies: [] }), makeWorldModel());
      expect(withDeps.score).toBeLessThan(withoutDeps.score);
    });
  });

  describe('factor scores', () => {
    it('getGoalClarityScore should score 0 for empty goal', () => {
      expect(service.getGoalClarityScore(makeIntent({ goal: '' }))).toBe(0);
    });

    it('getGoalClarityScore should score 1 for detailed goal', () => {
      expect(service.getGoalClarityScore(makeIntent({ goal: 'Deploy the production release to staging' }))).toBe(1);
    });

    it('getAuthorizationScore should be 1 when no confirmation needed', () => {
      expect(service.getAuthorizationScore(makeIntent({ requires_human_confirmation: false }))).toBe(1);
    });

    it('getAuthorizationScore should be 0.1 when confirmation needed but missing', () => {
      expect(service.getAuthorizationScore(makeIntent({ requires_human_confirmation: true, confirmed_by_human: false }))).toBe(0.1);
    });
  });
});
