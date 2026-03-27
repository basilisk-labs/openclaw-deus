export interface CognitiveParam {
  key: string;
  value: number;
  description: string;
  min: number;
  max: number;
  tunable: boolean;
  last_adjusted?: string;
  adjustment_reason?: string;
}

export interface CognitivePipelineResult {
  intentions_recognized: number;
  intentions_completed: number;
  knowledge_extracted: number;
  knowledge_gaps_found: number;
  deliberations_made: number;
  duration_ms: number;
}

export interface CalibrationReport {
  ece: number;
  overconfident: boolean;
  underconfident: boolean;
  correction_factor: number;
  sample_size: number;
  calibration_curve: Array<{
    predicted: number;
    actual: number;
    count: number;
  }>;
  suggestion: string;
}

export interface CausalNode {
  id: string;
  type: 'belief' | 'action' | 'outcome';
  label: string;
  confidence: number;
}

export interface CausalEdge {
  from: string;
  to: string;
  weight: number;
}

export interface CausalGraph {
  nodes: CausalNode[];
  edges: CausalEdge[];
}
