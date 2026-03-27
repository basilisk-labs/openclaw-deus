-- DEUS v7.4: Learned affect model weights

DEFINE TABLE affect_weights SCHEMAFULL;

DEFINE FIELD W1            ON affect_weights TYPE array<array>;
DEFINE FIELD W2            ON affect_weights TYPE array<array>;
DEFINE FIELD W_mode        ON affect_weights TYPE array<array>;
DEFINE FIELD learning_rate ON affect_weights TYPE float;
DEFINE FIELD step_count    ON affect_weights TYPE int;

DEFINE INDEX idx_affect_step ON affect_weights FIELDS step_count;

CREATE migration_history SET version = '012', applied_at = time::now();
