import { DissensusDecision, RipenessScore } from './policy.types';

export interface DeliberationOption {
  description: string;
  approach: 'minimal' | 'standard' | 'thorough';
  estimated_success: number;   // 0-1
  estimated_cost: 'low' | 'medium' | 'high';
  risks: string[];
  prerequisites: string[];
}

export interface SafetyCheck {
  dissensus: DissensusDecision;
  ripeness: RipenessScore;
  passed: boolean;
}

export interface Deliberation {
  id?: string;
  intention_id: string;
  trigger: 'new_intention' | 'progress_check' | 'blocker_detected' | 'reconsideration';

  options: DeliberationOption[];
  selected_option?: number;
  reasoning: string;
  commitment_level: 'tentative' | 'committed' | 'reconsiderable';

  safety_check?: SafetyCheck;

  outcome: 'pending' | 'succeeded' | 'failed' | 'reconsidered';
  outcome_notes?: string;

  created_at: string;
  resolved_at?: string;
}

export interface DeliberationResult {
  deliberation: Deliberation;
  action_to_take: string;
  safety_passed: boolean;
}
