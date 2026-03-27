/**
 * Self-Organized Modality Discovery — Types
 *
 * Modalities are NOT predefined channels.
 * They are DISCOVERED statistical regularities in a raw event stream.
 * Like a baby's brain learning to separate visual from audio.
 */

/** Raw event — undifferentiated input. No type, no modality — those are discovered. */
export interface RawSensoryEvent {
  content: string;
  source: string;           // hint only — system learns to ignore or use
  timestamp: number;        // monotonic
  byte_length: number;
}

/** Statistical fingerprint of an event — computed BEFORE any semantic processing. */
export interface EventFingerprint {
  // Lexical
  avg_token_length: number;
  unique_token_ratio: number;
  symbol_density: number;       // {, }, ;, :, (, ) per char
  numeric_ratio: number;
  uppercase_ratio: number;
  line_count: number;
  avg_line_length: number;

  // Information theory
  char_entropy: number;
  compression_ratio: number;    // unique chars / total chars (proxy)

  // Temporal
  time_since_last: number;
  burst_rate: number;           // events in last N ms

  // Repetition
  self_similarity: number;      // how similar to own cluster centroid
}

/** A discovered modality cluster. */
export interface DiscoveredModality {
  id: number;
  centroid: number[];           // average fingerprint vector
  member_count: number;
  born_at_cycle: number;
  label?: string;               // auto-derived from characteristic features

  // Learned projection: fingerprint → concept space position
  projection_weights: number[]; // fingerprint.length → concept_space_dims
  projection_bias: number[];
}

/** Output of modality processing. */
export interface ModalityResult {
  modality_id: number;
  modality_label?: string;
  is_new_modality: boolean;
  fingerprint: EventFingerprint;
  concept_position: number[];   // projected position in concept space
  novelty: number;              // how different from cluster centroid
}
