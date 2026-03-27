export type DiagnosisSeverity = 'low' | 'medium' | 'high' | 'critical';
export type RootCause = 'parameter' | 'logic' | 'data' | 'architecture';
export type HypothesisType = 'param_adjustment' | 'logic_extension' | 'new_stage' | 'strategy_change';

export interface ParamChange {
  key: string;
  from: number;
  to: number;
}

export interface Hypothesis {
  id: string;
  type: HypothesisType;
  description: string;
  target_service: string;
  target_method?: string;
  expected_improvement: string;
  confidence: number;
  param_changes?: ParamChange[];
  logic_proposal?: string;
  code_sketch?: string;
}

export interface Diagnosis {
  id?: string;
  dimension: string;
  severity: DiagnosisSeverity;
  description: string;
  root_cause: RootCause;
  hypotheses: Hypothesis[];
  created_at: string;
}

export interface DiagnosisResult {
  id?: string;
  snapshot_id: string;
  diagnoses: Diagnosis[];
  summary: string;
  created_at: string;
}
