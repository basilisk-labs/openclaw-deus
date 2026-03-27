-- DEUS v6.0: SOTA Cognitive Upgrades

-- ═══════════════════════════════════════════
-- META-LEARNING REPORTS
-- ═══════════════════════════════════════════
DEFINE TABLE meta_learning_report SCHEMAFULL;

DEFINE FIELD timestamp               ON meta_learning_report TYPE datetime;
DEFINE FIELD domain_effectiveness     ON meta_learning_report TYPE array<object>;
DEFINE FIELD knowledge_retention      ON meta_learning_report TYPE array<object>;
DEFINE FIELD deliberation_accuracy    ON meta_learning_report TYPE object;
DEFINE FIELD recommendations          ON meta_learning_report TYPE array<object>;

DEFINE INDEX idx_meta_ts ON meta_learning_report FIELDS timestamp;

-- ═══════════════════════════════════════════
-- EPISODE PREDECESSOR CHAIN (temporal sequencing)
-- ═══════════════════════════════════════════
DEFINE FIELD predecessor_episode_id ON episode TYPE option<string>;

CREATE migration_history SET version = '009', applied_at = time::now();
