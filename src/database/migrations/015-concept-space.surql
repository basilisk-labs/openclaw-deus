-- DEUS v9.0: Adaptive Concept Space

-- Trace gets position and velocity in concept space
DEFINE FIELD position ON trace TYPE array<float> DEFAULT [];
DEFINE FIELD velocity ON trace TYPE array<float> DEFAULT [];

-- Dimensions table — each dimension born from a conflict
DEFINE TABLE concept_dimension SCHEMAFULL;

DEFINE FIELD dimension_id       ON concept_dimension TYPE int;
DEFINE FIELD born_at_cycle      ON concept_dimension TYPE int;
DEFINE FIELD born_from_a        ON concept_dimension TYPE string;
DEFINE FIELD born_from_b        ON concept_dimension TYPE string;
DEFINE FIELD positive_exemplars ON concept_dimension TYPE array<string>;
DEFINE FIELD negative_exemplars ON concept_dimension TYPE array<string>;
DEFINE FIELD label              ON concept_dimension TYPE option<string>;
DEFINE FIELD variance           ON concept_dimension TYPE float DEFAULT 0;
DEFINE FIELD usage_count        ON concept_dimension TYPE int DEFAULT 0;

DEFINE INDEX idx_dim_id ON concept_dimension FIELDS dimension_id UNIQUE;

CREATE migration_history SET version = '015', applied_at = time::now();
