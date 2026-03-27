export const EPISODE_KINDS = ['task_execution', 'conversation', 'error_recovery', 'learning_moment'] as const;
export type EpisodeKind = typeof EPISODE_KINDS[number];

export const EPISODE_OUTCOMES = ['success', 'partial_success', 'failure', 'abandoned', 'ongoing'] as const;
export type EpisodeOutcome = typeof EPISODE_OUTCOMES[number];

export interface Lesson {
  content: string;
  kind: 'procedural' | 'factual' | 'strategic';
  confidence: number;
  applicable_when: string;   // conditions under which this lesson applies
}

export interface Episode {
  id?: string;
  episode_id: string;
  kind: EpisodeKind;
  summary: string;            // LLM-generated
  intention_id?: string;      // which intention this episode served
  predecessor_episode_id?: string; // temporal chain: previous episode for same intention
  outcome: EpisodeOutcome;
  outcome_detail?: string;
  lessons: Lesson[];
  duration_ms?: number;
  operator_satisfaction?: number; // inferred 0-1
  relevant_knowledge_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface Procedure {
  id?: string;
  procedure_id: string;
  description: string;
  steps: string[];
  when_to_use: string;
  when_not_to_use: string;
  success_rate: number;       // computed from episodes
  episode_ids: string[];      // evidence
  last_used?: string;
  created_at: string;
  updated_at: string;
}

export interface SelfAssessment {
  id?: string;
  domain: string;
  skill_level: number;        // 0-1
  basis: string;              // "succeeded 8/10 times in last month"
  common_mistakes: string[];
  improvement_trend: 'improving' | 'stable' | 'declining';
  episode_ids: string[];
  updated_at: string;
}
