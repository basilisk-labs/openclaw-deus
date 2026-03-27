export const IDENTITY_FILES = [
  'AGENTS.md',
  'SOUL.md',
  'IDENTITY.md',
  'USER.md',
  'DEUS.md',
] as const;

export const BOOTSTRAP_SEQUENCE = [
  { path: 'AGENTS.md', role: 'bootstrap_entrypoint', dynamic: false },
  { path: 'SOUL.md', role: 'operating_philosophy', dynamic: false },
  { path: 'IDENTITY.md', role: 'communication_stance', dynamic: false },
  { path: 'USER.md', role: 'human_context', dynamic: false },
  { path: 'DEUS.md', role: 'self_model_invariants', dynamic: false },
  { path: 'beliefs/core.jsonl', role: 'durable_beliefs', dynamic: false },
  { path: 'memory/YYYY-MM-DD.md', role: 'recent_episodic_continuity', dynamic: true },
] as const;

export const BELIEFS_SEED_FILE = 'beliefs/core.jsonl';
