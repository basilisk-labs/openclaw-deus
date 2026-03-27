-- DEUS Cognitive Runtime — Schema v2: Metrics & Recursive Improvement

-- ═══════════════════════════════════════════
-- COGNITIVE SNAPSHOTS
-- ═══════════════════════════════════════════
DEFINE TABLE cognitive_snapshot SCHEMAFULL;

DEFINE FIELD timestamp       ON cognitive_snapshot TYPE datetime;
DEFINE FIELD dimensions      ON cognitive_snapshot TYPE object;
DEFINE FIELD health_score    ON cognitive_snapshot TYPE float;
DEFINE FIELD weak_dimensions ON cognitive_snapshot TYPE array<string>;

DEFINE INDEX idx_snapshot_ts ON cognitive_snapshot FIELDS timestamp;

-- ═══════════════════════════════════════════
-- DIAGNOSES
-- ═══════════════════════════════════════════
DEFINE TABLE diagnosis SCHEMAFULL;

DEFINE FIELD snapshot_id  ON diagnosis TYPE string;
DEFINE FIELD diagnoses    ON diagnosis TYPE array<object>;
DEFINE FIELD summary      ON diagnosis TYPE string;
DEFINE FIELD created_at   ON diagnosis TYPE datetime;

-- ═══════════════════════════════════════════
-- EXPERIMENTS
-- ═══════════════════════════════════════════
DEFINE TABLE experiment SCHEMAFULL;

DEFINE FIELD hypothesis_id      ON experiment TYPE string;
DEFINE FIELD type               ON experiment TYPE string;
DEFINE FIELD status             ON experiment TYPE string;
DEFINE FIELD config_snapshot    ON experiment TYPE object;
DEFINE FIELD baseline_metrics   ON experiment TYPE object;
DEFINE FIELD baseline_benchmarks ON experiment TYPE array<object>;
DEFINE FIELD mutations          ON experiment TYPE array<object>;
DEFINE FIELD post_metrics       ON experiment TYPE option<object>;
DEFINE FIELD post_benchmarks    ON experiment TYPE option<array<object>>;
DEFINE FIELD improvement        ON experiment TYPE option<object>;
DEFINE FIELD verdict            ON experiment TYPE string;
DEFINE FIELD started_at         ON experiment TYPE datetime;
DEFINE FIELD finished_at        ON experiment TYPE option<datetime>;

DEFINE INDEX idx_experiment_status ON experiment FIELDS status;

-- ═══════════════════════════════════════════
-- COGNITIVE IMPROVEMENTS (logic proposals)
-- ═══════════════════════════════════════════
DEFINE TABLE cognitive_improvement SCHEMAFULL;

DEFINE FIELD hypothesis_id       ON cognitive_improvement TYPE string;
DEFINE FIELD type                ON cognitive_improvement TYPE string;
DEFINE FIELD target_service      ON cognitive_improvement TYPE string;
DEFINE FIELD target_method       ON cognitive_improvement TYPE option<string>;
DEFINE FIELD description         ON cognitive_improvement TYPE string;
DEFINE FIELD logic_proposal      ON cognitive_improvement TYPE string;
DEFINE FIELD code_sketch         ON cognitive_improvement TYPE option<string>;
DEFINE FIELD expected_improvement ON cognitive_improvement TYPE string;
DEFINE FIELD status              ON cognitive_improvement TYPE string;
DEFINE FIELD operator_notes      ON cognitive_improvement TYPE option<string>;
DEFINE FIELD created_at          ON cognitive_improvement TYPE datetime;
DEFINE FIELD reviewed_at         ON cognitive_improvement TYPE option<datetime>;

DEFINE INDEX idx_improvement_status ON cognitive_improvement FIELDS status;

-- ═══════════════════════════════════════════
-- BENCHMARK RESULTS
-- ═══════════════════════════════════════════
DEFINE TABLE benchmark_result SCHEMAFULL;

DEFINE FIELD total       ON benchmark_result TYPE int;
DEFINE FIELD passed      ON benchmark_result TYPE int;
DEFINE FIELD failed      ON benchmark_result TYPE int;
DEFINE FIELD results     ON benchmark_result TYPE array<object>;
DEFINE FIELD duration_ms ON benchmark_result TYPE int;
DEFINE FIELD run_at      ON benchmark_result TYPE datetime;

-- ═══════════════════════════════════════════
-- IMPROVEMENT RUNS
-- ═══════════════════════════════════════════
DEFINE TABLE improvement_run SCHEMAFULL;

DEFINE FIELD snapshot_id              ON improvement_run TYPE string;
DEFINE FIELD diagnoses_count          ON improvement_run TYPE int;
DEFINE FIELD experiments_run          ON improvement_run TYPE int;
DEFINE FIELD experiments_committed    ON improvement_run TYPE int;
DEFINE FIELD experiments_rolled_back  ON improvement_run TYPE int;
DEFINE FIELD logic_proposals_created  ON improvement_run TYPE int;
DEFINE FIELD started_at              ON improvement_run TYPE datetime;
DEFINE FIELD finished_at             ON improvement_run TYPE datetime;
