import { ActionTypeProfile, CanonicalActionType } from '../types/policy.types';

export const ACTION_TYPE_ALIASES: Record<string, CanonicalActionType> = {
  analysis: 'analyze',
  analyze: 'analyze',
  belief: 'belief_mutation',
  belief_mutation: 'belief_mutation',
  commit: 'git_commit',
  delete: 'destructive',
  deploy: 'deploy',
  destructive: 'destructive',
  email: 'external_message',
  external_message: 'external_message',
  git: 'git_commit',
  git_commit: 'git_commit',
  internal_write: 'write_internal',
  message: 'external_message',
  post: 'external_message',
  read: 'read',
  release: 'deploy',
  remove: 'destructive',
  repo: 'repo_mutation',
  repo_mutation: 'repo_mutation',
  repository_mutation: 'repo_mutation',
  reset: 'destructive',
  send_message: 'external_message',
  write: 'write_internal',
  write_internal: 'write_internal',
};

export const ACTION_TYPE_PROFILES: Record<string, ActionTypeProfile> = {
  read: {
    action_type: 'read', external: false, destructive: false,
    repo_mutation: false, belief_mutation: false, human_confirmation_required: false,
    high_impact: false, impact: 'none', reversibility: 'full',
  },
  analyze: {
    action_type: 'analyze', external: false, destructive: false,
    repo_mutation: false, belief_mutation: false, human_confirmation_required: false,
    high_impact: false, impact: 'none', reversibility: 'full',
  },
  write_internal: {
    action_type: 'write_internal', external: false, destructive: false,
    repo_mutation: false, belief_mutation: false, human_confirmation_required: false,
    high_impact: false, impact: 'low', reversibility: 'full',
  },
  git_commit: {
    action_type: 'git_commit', external: false, destructive: false,
    repo_mutation: true, belief_mutation: false, human_confirmation_required: false,
    high_impact: false, impact: 'medium', reversibility: 'partial',
  },
  repo_mutation: {
    action_type: 'repo_mutation', external: false, destructive: false,
    repo_mutation: true, belief_mutation: false, human_confirmation_required: true,
    high_impact: true, impact: 'high', reversibility: 'partial',
  },
  belief_mutation: {
    action_type: 'belief_mutation', external: false, destructive: false,
    repo_mutation: false, belief_mutation: true, human_confirmation_required: false,
    high_impact: true, impact: 'medium', reversibility: 'partial',
  },
  destructive: {
    action_type: 'destructive', external: false, destructive: true,
    repo_mutation: false, belief_mutation: false, human_confirmation_required: true,
    high_impact: true, impact: 'critical', reversibility: 'none',
  },
  external_message: {
    action_type: 'external_message', external: true, destructive: false,
    repo_mutation: false, belief_mutation: false, human_confirmation_required: true,
    high_impact: true, impact: 'high', reversibility: 'none',
  },
  deploy: {
    action_type: 'deploy', external: true, destructive: false,
    repo_mutation: false, belief_mutation: false, human_confirmation_required: true,
    high_impact: true, impact: 'critical', reversibility: 'partial',
  },
  unknown: {
    action_type: 'unknown', external: false, destructive: false,
    repo_mutation: false, belief_mutation: false, human_confirmation_required: false,
    high_impact: false, impact: 'unknown', reversibility: 'unknown',
  },
};

export const RIPENESS_WEIGHTS = {
  goal_clarity: 0.22,
  world_model_quality: 0.20,
  dependency_readiness: 0.20,
  authorization: 0.18,
  environment_readiness: 0.12,
  context_freshness: 0.08,
} as const;

export const INVARIANTS = ['I1', 'I2', 'I3', 'I4'] as const;
