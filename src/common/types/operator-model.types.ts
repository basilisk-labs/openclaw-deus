export interface ExpertiseEntry {
  domain: string;
  level: 'novice' | 'competent' | 'expert';
  confidence: number;
  evidence: string[];
}

export interface CommunicationPreferences {
  preferred_detail_level: 'concise' | 'standard' | 'thorough';
  preferred_format: 'prose' | 'structured' | 'code_heavy';
  tolerance_for_questions: 'low' | 'medium' | 'high';
  evidence: string[];
}

export interface SessionState {
  current_focus?: string;
  cognitive_load: 'low' | 'medium' | 'high';
  engagement: 'active' | 'sporadic' | 'idle';
  frustration_signals: number;
  last_interaction?: string;
  interaction_count: number;
}

export interface WorkingPatterns {
  active_hours?: string;       // "09:00-18:00 UTC"
  session_duration_avg?: number; // hours
  prefers_autonomous_work: boolean;
  review_style: 'detailed' | 'results_only' | 'exceptions_only';
}

export interface TrustModel {
  operator_trust_in_agent: number;  // inferred from override rate, acceptance
  agent_trust_in_operator: number;  // starts 1.0, adjusted
  evidence: string[];
}

export interface OperatorModel {
  id?: string;
  expertise: ExpertiseEntry[];
  communication: CommunicationPreferences;
  session: SessionState;
  patterns: WorkingPatterns;
  trust: TrustModel;
  updated_at: string;
}
