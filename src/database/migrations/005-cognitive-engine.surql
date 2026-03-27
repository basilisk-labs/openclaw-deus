-- DEUS v3.0: Cognitive Engine — Vector Search, Tensions, Predictions, Calibration

-- Belief embeddings for semantic similarity
DEFINE TABLE belief_embedding SCHEMAFULL;
DEFINE FIELD belief_id ON belief_embedding TYPE string;
DEFINE FIELD embedding ON belief_embedding TYPE array<float>;
DEFINE FIELD content_hash ON belief_embedding TYPE string;
DEFINE INDEX idx_emb_belief ON belief_embedding FIELDS belief_id;
DEFINE INDEX idx_emb_hash ON belief_embedding FIELDS content_hash;

-- Memory embeddings (optional field on activity_log)
DEFINE FIELD embedding ON activity_log TYPE option<array<float>>;
DEFINE FIELD importance ON activity_log TYPE option<float>;

-- Tension edges (replaces binary contradictions, continuous degree 0-1)
DEFINE TABLE tensions TYPE RELATION FROM belief TO belief SCHEMAFULL;
DEFINE FIELD relation ON tensions TYPE string;
DEFINE FIELD degree ON tensions TYPE float;
DEFINE FIELD explanation ON tensions TYPE string;
DEFINE FIELD detected_at ON tensions TYPE datetime DEFAULT time::now();
DEFINE FIELD resolvable ON tensions TYPE bool DEFAULT true;
DEFINE INDEX idx_tensions_degree ON tensions FIELDS degree;

-- Predictions for calibration tracking
DEFINE TABLE prediction SCHEMAFULL;
DEFINE FIELD content ON prediction TYPE string;
DEFINE FIELD confidence ON prediction TYPE float;
DEFINE FIELD outcome ON prediction TYPE option<bool>;
DEFINE FIELD resolved_at ON prediction TYPE option<datetime>;
DEFINE FIELD created_at ON prediction TYPE datetime DEFAULT time::now();
DEFINE INDEX idx_pred_outcome ON prediction FIELDS outcome;

-- Policy overrides for adaptive threshold learning
DEFINE TABLE policy_override SCHEMAFULL;
DEFINE FIELD decision_id ON policy_override TYPE string;
DEFINE FIELD original_decision ON policy_override TYPE string;
DEFINE FIELD override_to ON policy_override TYPE string;
DEFINE FIELD reason ON policy_override TYPE option<string>;
DEFINE FIELD created_at ON policy_override TYPE datetime DEFAULT time::now();

-- LLM token usage tracking
DEFINE TABLE llm_token_usage SCHEMAFULL;
DEFINE FIELD day_key ON llm_token_usage TYPE string;
DEFINE FIELD input_tokens ON llm_token_usage TYPE int DEFAULT 0;
DEFINE FIELD output_tokens ON llm_token_usage TYPE int DEFAULT 0;
DEFINE FIELD cache_read_tokens ON llm_token_usage TYPE int DEFAULT 0;
DEFINE FIELD call_count ON llm_token_usage TYPE int DEFAULT 0;
DEFINE FIELD by_operation ON llm_token_usage TYPE object DEFAULT {};
DEFINE INDEX idx_llm_day ON llm_token_usage FIELDS day_key UNIQUE;

-- Memory archive (cold storage for forgotten low-importance memories)
DEFINE TABLE activity_log_archive SCHEMAFULL;
DEFINE FIELD type ON activity_log_archive TYPE string;
DEFINE FIELD description ON activity_log_archive TYPE string;
DEFINE FIELD importance ON activity_log_archive TYPE option<float>;
DEFINE FIELD day_key ON activity_log_archive TYPE string;
DEFINE FIELD timestamp ON activity_log_archive TYPE datetime;
DEFINE FIELD archived_at ON activity_log_archive TYPE datetime DEFAULT time::now();

-- Enhanced belief fields for Bayesian decay
DEFINE FIELD last_reinforcement ON belief TYPE option<datetime>;
DEFINE FIELD evidence_quality ON belief TYPE option<string>;
DEFINE FIELD extraction_method ON belief TYPE option<string>;

-- Migration tracking
CREATE migration_history SET version = '005', applied_at = time::now();
