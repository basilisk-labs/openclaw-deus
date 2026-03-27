-- DEUS v10.0: Unified Mind — trajectories

DEFINE TABLE trajectory SCHEMAFULL;

DEFINE FIELD from_trace_id  ON trajectory TYPE string;
DEFINE FIELD to_trace_id    ON trajectory TYPE string;
DEFINE FIELD from_position  ON trajectory TYPE array<float>;
DEFINE FIELD to_position    ON trajectory TYPE array<float>;
DEFINE FIELD action         ON trajectory TYPE string;
DEFINE FIELD confidence     ON trajectory TYPE float;
DEFINE FIELD traversal_count ON trajectory TYPE int DEFAULT 1;

CREATE migration_history SET version = '016', applied_at = time::now();
