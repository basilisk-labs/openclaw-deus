export type BenchmarkCategory = 'extraction' | 'deliberation' | 'coherence' | 'knowledge' | 'intention' | 'integration';

export interface BenchmarkExpectations {
  min_intentions?: number;
  min_knowledge?: number;
  max_duration_ms?: number;
  min_coherence?: number;
  expected_posture?: string;
  min_contradictions?: number;
  min_options?: number;
  min_stages_passed?: number;
  all_stages_passed?: boolean;
}

export interface BenchmarkScenario {
  id: string;
  name: string;
  category: BenchmarkCategory;
  input: {
    messages: string[];
    setup?: Record<string, unknown>;
  };
  expectations: BenchmarkExpectations;
}

export interface BenchmarkResult {
  id?: string;
  scenario_id: string;
  scenario_name: string;
  passed: boolean;
  actual: Record<string, unknown>;
  expected: Record<string, unknown>;
  failures: string[];
  duration_ms: number;
  delta_from_baseline?: Record<string, number>;
  run_at: string;
}

export interface BenchmarkSuiteResult {
  id?: string;
  total: number;
  passed: number;
  failed: number;
  results: BenchmarkResult[];
  duration_ms: number;
  run_at: string;
}
