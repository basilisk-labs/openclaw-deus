export interface WorldModel {
  id?: string;
  version: number;
  generated_at: string;
  workspace_day: string;
  confidence: number;
  self_model: SelfModel;
  human_model: HumanModel;
  workspace_model: WorkspaceModel;
  environment_model: EnvironmentModel;
  action_priors: ActionPriors;
  sources: WorldModelSources;
}

export interface SelfModel {
  agency_level: string;
  invariants: { id: string; content: string; confidence: number }[];
  goals: { id: string; content: string; confidence: number }[];
  review_pressure: number;
  active_limitations: string[];
}

export interface HumanModel {
  preferences: string[];
  constraints: string[];
  active_requests: string[];
}

export interface WorkspaceModel {
  active_project: string | null;
  mode: string;
  status: string;
  repo_dirty: boolean;
  memory_freshness_days: number;
  introspection_date: string | null;
  next_step: string | null;
}

export interface EnvironmentModel {
  waiting_conditions: string[];
  dependencies: string[];
  open_tensions: string[];
  external_systems: string[];
}

export interface ActionPriors {
  hard_blocks: string[];
  preferred_modes: string[];
  active_risks: string[];
}

export interface WorldModelSources {
  beliefs: { count: number };
  memory: { days: number; latest_day: string | null };
  logs: { entries: number };
  pending_beliefs: { count: number };
  status: { exists: boolean };
}
