-- DEUS v7.2: Graph Learning — Hebbian + Reinforcement + Backprop

-- Edge learning metadata for activates relation
DEFINE FIELD co_activation_count   ON activates TYPE int DEFAULT 0;
DEFINE FIELD last_co_activation    ON activates TYPE int DEFAULT 0;
DEFINE FIELD prediction_error_sum  ON activates TYPE float DEFAULT 0;
DEFINE FIELD outcome_reinforcement ON activates TYPE float DEFAULT 0;
DEFINE FIELD initial_weight        ON activates TYPE option<float>;

-- Same for inhibits relation
DEFINE FIELD co_activation_count   ON inhibits TYPE int DEFAULT 0;
DEFINE FIELD last_co_activation    ON inhibits TYPE int DEFAULT 0;
DEFINE FIELD prediction_error_sum  ON inhibits TYPE float DEFAULT 0;
DEFINE FIELD outcome_reinforcement ON inhibits TYPE float DEFAULT 0;
DEFINE FIELD initial_weight        ON inhibits TYPE option<float>;

CREATE migration_history SET version = '011', applied_at = time::now();
