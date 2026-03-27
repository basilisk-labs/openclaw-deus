-- DEUS Cognitive Runtime — SurrealDB Schema v1

-- ═══════════════════════════════════════════
-- BELIEFS
-- ═══════════════════════════════════════════
DEFINE TABLE belief SCHEMAFULL;

DEFINE FIELD belief_id        ON belief TYPE string  ASSERT $value != NONE;
DEFINE FIELD content          ON belief TYPE string  ASSERT $value != NONE;
DEFINE FIELD confidence       ON belief TYPE float   ASSERT $value >= 0 AND $value <= 1;
DEFINE FIELD evidence_set     ON belief TYPE array<string>;
DEFINE FIELD source_type      ON belief TYPE string;
DEFINE FIELD belief_class     ON belief TYPE string
  ASSERT $value IN ['axiom', 'self_model', 'user_model', 'operational', 'hypothesis'];
DEFINE FIELD decay_mode       ON belief TYPE string
  ASSERT $value IN ['no_decay', 'slow', 'normal', 'fast'];
DEFINE FIELD confidence_floor ON belief TYPE float   ASSERT $value >= 0 AND $value <= 1;
DEFINE FIELD review_threshold ON belief TYPE float   ASSERT $value >= 0 AND $value <= 1;
DEFINE FIELD context_scope    ON belief TYPE string;
DEFINE FIELD status           ON belief TYPE string
  ASSERT $value IN ['active', 'archived', 'review_needed', 'deprecated'];
DEFINE FIELD drift_history      ON belief TYPE array<object>;
DEFINE FIELD ontological_anchor ON belief TYPE option<string>;
DEFINE FIELD inference_trace    ON belief TYPE array<string>;
DEFINE FIELD archivable         ON belief TYPE bool DEFAULT true;
DEFINE FIELD refresh_strategy   ON belief TYPE option<string>;
DEFINE FIELD timestamp_created  ON belief TYPE datetime;
DEFINE FIELD timestamp_updated  ON belief TYPE datetime;

DEFINE INDEX idx_belief_id     ON belief FIELDS belief_id UNIQUE;
DEFINE INDEX idx_belief_class  ON belief FIELDS belief_class;
DEFINE INDEX idx_belief_status ON belief FIELDS status;
DEFINE INDEX idx_belief_scope  ON belief FIELDS context_scope;

DEFINE ANALYZER belief_content TOKENIZERS blank, class FILTERS lowercase, snowball(russian), snowball(english);
-- NOTE: Full-text SEARCH indexes removed — not supported in SurrealDB 3.0
-- Use string::contains() for text search in application code

-- ═══════════════════════════════════════════
-- ACTIVITY LOGS
-- ═══════════════════════════════════════════
DEFINE TABLE activity_log SCHEMAFULL;

DEFINE FIELD type        ON activity_log TYPE string
  ASSERT $value IN ['git', 'command', 'decision', 'interaction', 'event'];
DEFINE FIELD description ON activity_log TYPE string;
DEFINE FIELD context     ON activity_log TYPE object DEFAULT {};
DEFINE FIELD agent       ON activity_log TYPE string DEFAULT 'DEUS';
DEFINE FIELD day_key     ON activity_log TYPE string;
DEFINE FIELD timestamp   ON activity_log TYPE datetime;

DEFINE INDEX idx_log_day  ON activity_log FIELDS day_key;
DEFINE INDEX idx_log_type ON activity_log FIELDS type;

DEFINE ANALYZER log_content TOKENIZERS blank, class FILTERS lowercase;

-- ═══════════════════════════════════════════
-- DAILY MEMORY
-- ═══════════════════════════════════════════
DEFINE TABLE daily_memory SCHEMAFULL;

DEFINE FIELD day_key      ON daily_memory TYPE string ASSERT $value != NONE;
DEFINE FIELD sections     ON daily_memory TYPE object;
DEFINE FIELD entry_count  ON daily_memory TYPE int DEFAULT 0;
DEFINE FIELD generated_at ON daily_memory TYPE datetime;

DEFINE INDEX idx_memory_day ON daily_memory FIELDS day_key UNIQUE;

-- ═══════════════════════════════════════════
-- REVIEW QUEUE
-- ═══════════════════════════════════════════
DEFINE TABLE review_candidate SCHEMAFULL;

DEFINE FIELD content              ON review_candidate TYPE string;
DEFINE FIELD confidence_proposal  ON review_candidate TYPE float;
DEFINE FIELD recurrence           ON review_candidate TYPE int DEFAULT 1;
DEFINE FIELD source               ON review_candidate TYPE string;
DEFINE FIELD category             ON review_candidate TYPE string;
DEFINE FIELD prefix               ON review_candidate TYPE string;
DEFINE FIELD human_review_needed  ON review_candidate TYPE string DEFAULT 'no';
DEFINE FIELD status               ON review_candidate TYPE string
  ASSERT $value IN ['pending', 'promoted', 'deferred', 'rejected'];
DEFINE FIELD created_at           ON review_candidate TYPE datetime;
DEFINE FIELD updated_at           ON review_candidate TYPE datetime;

DEFINE INDEX idx_review_status ON review_candidate FIELDS status;

-- ═══════════════════════════════════════════
-- WORLD MODEL SNAPSHOTS
-- ═══════════════════════════════════════════
DEFINE TABLE world_model SCHEMAFULL;

DEFINE FIELD version           ON world_model TYPE int DEFAULT 1;
DEFINE FIELD generated_at      ON world_model TYPE datetime;
DEFINE FIELD workspace_day     ON world_model TYPE string;
DEFINE FIELD confidence        ON world_model TYPE float;
DEFINE FIELD self_model        ON world_model TYPE object;
DEFINE FIELD human_model       ON world_model TYPE object;
DEFINE FIELD workspace_model   ON world_model TYPE object;
DEFINE FIELD environment_model ON world_model TYPE object;
DEFINE FIELD action_priors     ON world_model TYPE object;
DEFINE FIELD sources           ON world_model TYPE object;

DEFINE INDEX idx_wm_day ON world_model FIELDS workspace_day;

-- ═══════════════════════════════════════════
-- INTROSPECTION REPORTS
-- ═══════════════════════════════════════════
DEFINE TABLE introspection_report SCHEMAFULL;

DEFINE FIELD profile         ON introspection_report TYPE string;
DEFINE FIELD executed_stages ON introspection_report TYPE array<string>;
DEFINE FIELD coherence_score ON introspection_report TYPE float;
DEFINE FIELD posture         ON introspection_report TYPE string;
DEFINE FIELD summary         ON introspection_report TYPE object;
DEFINE FIELD stage_outputs   ON introspection_report TYPE object;
DEFINE FIELD generated_at    ON introspection_report TYPE datetime;

-- ═══════════════════════════════════════════
-- POLICY DECISIONS (audit trail)
-- ═══════════════════════════════════════════
DEFINE TABLE policy_decision SCHEMAFULL;

DEFINE FIELD action_type    ON policy_decision TYPE string;
DEFINE FIELD decision       ON policy_decision TYPE string;
DEFINE FIELD trigger_type   ON policy_decision TYPE string;
DEFINE FIELD target         ON policy_decision TYPE option<string>;
DEFINE FIELD target_class   ON policy_decision TYPE string;
DEFINE FIELD reason         ON policy_decision TYPE string;
DEFINE FIELD ripeness_score ON policy_decision TYPE option<float>;
DEFINE FIELD evaluated_at   ON policy_decision TYPE datetime;

DEFINE INDEX idx_policy_decision ON policy_decision FIELDS decision;

-- ═══════════════════════════════════════════
-- NIGHTLY RUN LOG
-- ═══════════════════════════════════════════
DEFINE TABLE nightly_run SCHEMAFULL;

DEFINE FIELD stages      ON nightly_run TYPE array<object>;
DEFINE FIELD stage_order ON nightly_run TYPE array<string>;
DEFINE FIELD summary     ON nightly_run TYPE object;
DEFINE FIELD started_at  ON nightly_run TYPE datetime;
DEFINE FIELD finished_at ON nightly_run TYPE datetime;
