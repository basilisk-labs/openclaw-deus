-- DEUS v7.7: Narrative frames for commit log compaction

DEFINE TABLE narrative_frame SCHEMAFULL;

DEFINE FIELD timeframe        ON narrative_frame TYPE string;
DEFINE FIELD summary          ON narrative_frame TYPE string;
DEFINE FIELD temporal_quality  ON narrative_frame TYPE string;
DEFINE FIELD key_events       ON narrative_frame TYPE array<string>;
DEFINE FIELD unresolved       ON narrative_frame TYPE array<string>;

CREATE migration_history SET version = '014', applied_at = time::now();
