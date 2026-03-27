/**
 * Adaptive Concept Space types.
 *
 * Dimensions are born from conflicts, not predefined.
 * Traces have positions that evolve through experience.
 * Abstractions are centroids of spatial clusters.
 */

export interface Dimension {
  id: number;
  born_at_cycle: number;
  born_from_conflict: { trace_a: string; trace_b: string };

  // Emergent labels — discovered from exemplars, not assigned
  positive_exemplars: string[];
  negative_exemplars: string[];
  label?: string;

  // Statistics
  variance: number;
  usage_count: number;
}

export interface SpatialConflict {
  trace_a_id: string;
  trace_b_id: string;
  trace_a_content: string;
  trace_b_content: string;
  distance: number;
  severity: number;          // 1/distance — closer = more severe
  resolved: boolean;
  resolved_by_dimension?: number;
}

export interface SpatialMovement {
  trace_id: string;
  delta: number[];
  reason: string;
}

export interface SpatialCluster {
  centroid: number[];
  traces: string[];
  radius: number;
  shared_words: string[];
}

// ═══════════════════════════════════════════
// UNIFIED WORLD MODEL (concept space IS the world model)
// ═══════════════════════════════════════════

export interface WorldSnapshot {
  dimensions: Dimension[];
  dimension_count: number;
  trace_count: number;
  regions: SpatialCluster[];       // discovered categories
  self_region: SpatialCluster | null; // traces about self
  gradient_field: GradientField;    // current affect field
  trajectories: Trajectory[];       // known cause-effect paths

  // Derived from spatial state
  confidence: number;               // coverage of space
  coherence: number;                // cluster quality
  gaps: SpatialGap[];              // empty regions
}

export interface Trajectory {
  from_trace_id: string;
  to_trace_id: string;
  from_position: number[];
  to_position: number[];
  action: string;
  confidence: number;
  traversal_count: number;
}

export interface GradientField {
  attractors: Array<{ position: number[]; strength: number; source: string }>;
  repellers: Array<{ position: number[]; strength: number; source: string }>;
}

export interface SpatialGap {
  position: number[];
  expected_by: string;             // which dimension structure predicts traces here
  severity: number;
}
