-- DEUS v7.0: Cognitive Kernel — Trace Graph + Commit Log

-- ═══════════════════════════════════════════
-- TRACES — unified memory substrate
-- ═══════════════════════════════════════════
DEFINE TABLE trace SCHEMAFULL;

DEFINE FIELD trace_id             ON trace TYPE string;
DEFINE FIELD source_type          ON trace TYPE string;
DEFINE FIELD source_id            ON trace TYPE option<string>;
DEFINE FIELD content              ON trace TYPE string;
DEFINE FIELD weight               ON trace TYPE float;
DEFINE FIELD initial_weight       ON trace TYPE float;
DEFINE FIELD freshness            ON trace TYPE float;
DEFINE FIELD confidence           ON trace TYPE float;
DEFINE FIELD emotional_charge     ON trace TYPE float;
DEFINE FIELD reactivation_count   ON trace TYPE int DEFAULT 0;
DEFINE FIELD last_reactivated_cycle ON trace TYPE int;
DEFINE FIELD reactivation_history ON trace TYPE array<int>;
DEFINE FIELD created_at_cycle     ON trace TYPE int;
DEFINE FIELD suppressed           ON trace TYPE bool DEFAULT false;
DEFINE FIELD archived             ON trace TYPE bool DEFAULT false;

DEFINE INDEX idx_trace_id ON trace FIELDS trace_id UNIQUE;
DEFINE INDEX idx_trace_active ON trace FIELDS archived, suppressed;
DEFINE INDEX idx_trace_cycle ON trace FIELDS last_reactivated_cycle;

-- Trace relations
DEFINE TABLE activates SCHEMAFULL;
DEFINE FIELD weight ON activates TYPE float;

DEFINE TABLE inhibits SCHEMAFULL;
DEFINE FIELD weight ON inhibits TYPE float;

DEFINE TABLE precedes SCHEMAFULL;

DEFINE TABLE caused_by SCHEMAFULL;

DEFINE TABLE similar_to SCHEMAFULL;
DEFINE FIELD weight ON similar_to TYPE float;

-- ═══════════════════════════════════════════
-- COMMIT LOG — immutable record of what system "noticed"
-- ═══════════════════════════════════════════
DEFINE TABLE commit_log SCHEMAFULL;

DEFINE FIELD commit_id        ON commit_log TYPE string;
DEFINE FIELD cycle            ON commit_log TYPE int;
DEFINE FIELD type             ON commit_log TYPE string;
DEFINE FIELD source_agents    ON commit_log TYPE array<string>;
DEFINE FIELD convergence_score ON commit_log TYPE float;
DEFINE FIELD is_escalation    ON commit_log TYPE bool;
DEFINE FIELD novelty_cost     ON commit_log TYPE float;
DEFINE FIELD prediction_error ON commit_log TYPE float;
DEFINE FIELD maturity         ON commit_log TYPE float;
DEFINE FIELD urgency          ON commit_log TYPE float;
DEFINE FIELD energy           ON commit_log TYPE float;
DEFINE FIELD changes          ON commit_log TYPE object;

DEFINE INDEX idx_commit_cycle ON commit_log FIELDS cycle;
DEFINE INDEX idx_commit_type ON commit_log FIELDS type;
DEFINE INDEX idx_commit_id ON commit_log FIELDS commit_id UNIQUE;

CREATE migration_history SET version = '010', applied_at = time::now();
