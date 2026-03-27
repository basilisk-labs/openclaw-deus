-- Migration 018: Clustered representations + vector index
-- Clusters as first-class graph entities with soft membership and hierarchy

-- Persistent clusters (materialized from concept space)
DEFINE TABLE cluster SCHEMAFULL;
DEFINE FIELD cluster_id         ON cluster TYPE string;
DEFINE FIELD centroid            ON cluster TYPE array<float>;
DEFINE FIELD radius              ON cluster TYPE float DEFAULT 0;
DEFINE FIELD member_count        ON cluster TYPE int DEFAULT 0;
DEFINE FIELD confidence          ON cluster TYPE float DEFAULT 0;
DEFINE FIELD abstraction_trace   ON cluster TYPE option<string>;
DEFINE FIELD born_at_cycle       ON cluster TYPE int DEFAULT 0;
DEFINE FIELD last_updated_cycle  ON cluster TYPE int DEFAULT 0;
DEFINE FIELD archived            ON cluster TYPE bool DEFAULT false;

DEFINE INDEX idx_cluster_id ON cluster FIELDS cluster_id UNIQUE;

-- Soft membership: trace belongs to cluster(s) with varying strength
DEFINE TABLE belongs_to SCHEMAFULL TYPE RELATION FROM trace TO cluster;
DEFINE FIELD membership_strength ON belongs_to TYPE float DEFAULT 1.0;
DEFINE FIELD since_cycle         ON belongs_to TYPE int DEFAULT 0;

-- Cluster hierarchy: cluster contains sub-clusters
DEFINE TABLE contains SCHEMAFULL TYPE RELATION FROM cluster TO cluster;
DEFINE FIELD hierarchy_level ON contains TYPE int DEFAULT 0;

-- Cluster-level trajectories: action at cluster A → end up in cluster B
DEFINE TABLE cluster_trajectory SCHEMAFULL;
DEFINE FIELD from_cluster ON cluster_trajectory TYPE string;
DEFINE FIELD to_cluster   ON cluster_trajectory TYPE string;
DEFINE FIELD action        ON cluster_trajectory TYPE string;
DEFINE FIELD confidence    ON cluster_trajectory TYPE float DEFAULT 0.5;
DEFINE FIELD traversal_count ON cluster_trajectory TYPE int DEFAULT 1;

-- Vector index for spatial nearest-neighbor queries O(log n)
DEFINE INDEX idx_trace_position ON trace FIELDS position MTREE DIMENSION 64 TYPE F32;
