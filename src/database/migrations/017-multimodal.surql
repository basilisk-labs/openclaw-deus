-- DEUS v11.0: Self-Organized Modality Discovery

-- Trace gets discovered modality tag
DEFINE FIELD modality_id ON trace TYPE option<int>;

-- Discovered modalities (born from novelty, not predefined)
DEFINE TABLE discovered_modality SCHEMAFULL;

DEFINE FIELD modality_id        ON discovered_modality TYPE int;
DEFINE FIELD centroid           ON discovered_modality TYPE array<float>;
DEFINE FIELD member_count       ON discovered_modality TYPE int DEFAULT 0;
DEFINE FIELD born_at_cycle      ON discovered_modality TYPE int;
DEFINE FIELD label              ON discovered_modality TYPE option<string>;
DEFINE FIELD projection_weights ON discovered_modality TYPE array<float>;
DEFINE FIELD projection_bias    ON discovered_modality TYPE array<float>;

DEFINE INDEX idx_modality_id ON discovered_modality FIELDS modality_id UNIQUE;

CREATE migration_history SET version = '017', applied_at = time::now();
