export const INTENTION_KINDS = ['goal', 'task', 'sub_task', 'standing_order'] as const;
export type IntentionKind = typeof INTENTION_KINDS[number];

export const INTENTION_SOURCES = ['operator_explicit', 'operator_inferred', 'agent_derived', 'system'] as const;
export type IntentionSource = typeof INTENTION_SOURCES[number];

export const INTENTION_STATUSES = ['recognized', 'adopted', 'active', 'suspended', 'completed', 'failed', 'abandoned'] as const;
export type IntentionStatus = typeof INTENTION_STATUSES[number];

export interface IntentionProgress {
  estimated_completion: number; // 0.0 - 1.0
  last_action: string;
  blockers: string[];
}

export interface Intention {
  id?: string;
  intention_id: string;
  description: string;
  kind: IntentionKind;
  source: IntentionSource;
  status: IntentionStatus;

  // Hierarchy
  parent_id?: string;
  children_ids: string[];

  // Success criteria
  success_criteria: string;
  progress: IntentionProgress;

  // Lifecycle
  recognized_at: string;
  adopted_at?: string;
  completed_at?: string;
  abandoned_reason?: string;

  // Context
  relevant_knowledge_ids: string[];
  priority: number;         // 0.0 - 1.0
  deadline?: string;

  created_at: string;
  updated_at: string;
}

export interface IntentionTransition {
  id?: string;
  intention_id: string;
  from_status: IntentionStatus;
  to_status: IntentionStatus;
  reason: string;
  triggered_by: 'operator' | 'agent_deliberation' | 'task_completion' | 'timeout' | 'blocker';
  timestamp: string;
}

export interface IntentionRecognitionResult {
  new_intentions: Array<{
    description: string;
    kind: IntentionKind;
    source: IntentionSource;
    success_criteria: string;
    parent_intention_id?: string;
    priority: number;
    reasoning: string;
  }>;
  updated_intentions: Array<{
    intention_id: string;
    update: Partial<{
      status: IntentionStatus;
      progress: Partial<IntentionProgress>;
      priority: number;
      description: string;
    }>;
    reasoning: string;
  }>;
  completed_intentions: Array<{
    intention_id: string;
    outcome: 'completed' | 'failed' | 'abandoned';
    reasoning: string;
  }>;
}
