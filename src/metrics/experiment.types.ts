import { CognitiveSnapshot } from './metrics.types';
import { ParamChange } from './diagnosis.types';
import { BenchmarkResult } from './benchmark.types';

export type ExperimentStatus = 'running' | 'completed' | 'rolled_back';
export type ExperimentVerdict = 'improved' | 'regressed' | 'neutral';
export type ExperimentType = 'param_adjustment' | 'logic_extension';

export interface Experiment {
  id?: string;
  hypothesis_id: string;
  type: ExperimentType;
  status: ExperimentStatus;

  config_snapshot: Record<string, number>;
  baseline_metrics: CognitiveSnapshot;
  baseline_benchmarks: BenchmarkResult[];

  mutations: ParamChange[];

  post_metrics?: CognitiveSnapshot;
  post_benchmarks?: BenchmarkResult[];
  improvement?: Record<string, number>;
  verdict: ExperimentVerdict;

  started_at: string;
  finished_at?: string;
}

export interface ImprovementRun {
  id?: string;
  snapshot_id: string;
  diagnoses_count: number;
  experiments_run: number;
  experiments_committed: number;
  experiments_rolled_back: number;
  logic_proposals_created: number;
  started_at: string;
  finished_at: string;
}

export interface CognitiveImprovement {
  id?: string;
  hypothesis_id: string;
  type: 'logic_extension' | 'new_stage' | 'strategy_change';
  target_service: string;
  target_method?: string;
  description: string;
  logic_proposal: string;
  code_sketch?: string;
  expected_improvement: string;
  status: 'pending' | 'approved' | 'rejected' | 'implemented';
  operator_notes?: string;
  created_at: string;
  reviewed_at?: string;
}
