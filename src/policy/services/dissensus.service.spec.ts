import { Test, TestingModule } from '@nestjs/testing';
import { DissensusService } from './dissensus.service';
import { IntentNormalizerService } from './intent-normalizer.service';
import { NormalizedIntent } from '../../common/types/policy.types';
import { WorldModel } from '../../common/types/world-model.types';

function makeIntent(overrides: Partial<NormalizedIntent> = {}): NormalizedIntent {
  return {
    version: 1, goal: 'test', action_type: 'read', target: null,
    external: false, destructive: false, confirmed_by_human: false,
    dependencies: [], urgency: 'medium', context_sources: [],
    repo_mutation: false, belief_mutation: false,
    requires_human_confirmation: false, high_impact: false, scope: 'internal',
    ...overrides,
  };
}

function makeWorldModel(overrides: Partial<WorldModel> = {}): WorldModel {
  return {
    version: 1, generated_at: new Date().toISOString(), workspace_day: '2026-03-25',
    confidence: 0.8,
    self_model: { agency_level: 'L2+', invariants: [], goals: [], review_pressure: 0, active_limitations: [] },
    human_model: { preferences: [], constraints: [], active_requests: [] },
    workspace_model: { active_project: null, mode: 'idle', status: 'idle', repo_dirty: false, memory_freshness_days: 0, introspection_date: null, next_step: null },
    environment_model: { waiting_conditions: [], dependencies: [], open_tensions: [], external_systems: [] },
    action_priors: { hard_blocks: [], preferred_modes: [], active_risks: [] },
    sources: { beliefs: { count: 0 }, memory: { days: 0, latest_day: null }, logs: { entries: 0 }, pending_beliefs: { count: 0 }, status: { exists: true } },
    ...overrides,
  };
}

describe('DissensusService', () => {
  let service: DissensusService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DissensusService, IntentNormalizerService],
    }).compile();
    service = module.get(DissensusService);
  });

  it('should allow safe read actions', () => {
    const result = service.evaluate(makeIntent(), makeWorldModel());
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().decision).toBe('allow');
  });

  it('should refuse_l3 on invariant conflict', () => {
    const wm = makeWorldModel({ action_priors: { hard_blocks: ['invariant conflict detected'], preferred_modes: [], active_risks: [] } });
    const result = service.evaluate(makeIntent(), wm);
    expect(result._unsafeUnwrap().decision).toBe('refuse_l3');
    expect(result._unsafeUnwrap().trigger_type).toBe('invariant_conflict');
  });

  it('should pause_l2 when human confirmation missing', () => {
    const intent = makeIntent({ requires_human_confirmation: true, confirmed_by_human: false });
    const result = service.evaluate(intent, makeWorldModel());
    expect(result._unsafeUnwrap().decision).toBe('pause_l2');
    expect(result._unsafeUnwrap().override_allowed).toBe(true);
  });

  it('should signal_l1 for identity root target', () => {
    const intent = makeIntent({ target: 'AGENTS.md' });
    const result = service.evaluate(intent, makeWorldModel());
    expect(result._unsafeUnwrap().decision).toBe('signal_l1');
    expect(result._unsafeUnwrap().trigger_type).toBe('identity_critical_mutation');
  });

  it('should signal_l1 for belief mutation', () => {
    const intent = makeIntent({ belief_mutation: true });
    const result = service.evaluate(intent, makeWorldModel());
    expect(result._unsafeUnwrap().decision).toBe('signal_l1');
    expect(result._unsafeUnwrap().trigger_type).toBe('durable_belief_mutation');
  });

  it('should signal_l1 for destructive actions', () => {
    const intent = makeIntent({ destructive: true });
    const result = service.evaluate(intent, makeWorldModel());
    expect(result._unsafeUnwrap().decision).toBe('signal_l1');
    expect(result._unsafeUnwrap().trigger_type).toBe('destructive_action');
  });

  it('should signal_l1 for external actions', () => {
    const intent = makeIntent({ external: true });
    const result = service.evaluate(intent, makeWorldModel());
    expect(result._unsafeUnwrap().decision).toBe('signal_l1');
    expect(result._unsafeUnwrap().trigger_type).toBe('external_action');
  });

  it('should signal_l1 for high impact actions', () => {
    const intent = makeIntent({ high_impact: true });
    const result = service.evaluate(intent, makeWorldModel());
    expect(result._unsafeUnwrap().decision).toBe('signal_l1');
    expect(result._unsafeUnwrap().trigger_type).toBe('high_impact_attention');
  });

  it('should respect decision priority: refuse > pause > signal > allow', () => {
    // invariant + missing confirmation → refuse wins
    const wm = makeWorldModel({ action_priors: { hard_blocks: ['invariant conflict'], preferred_modes: [], active_risks: [] } });
    const intent = makeIntent({ requires_human_confirmation: true });
    const result = service.evaluate(intent, wm);
    expect(result._unsafeUnwrap().decision).toBe('refuse_l3');
  });
});
