import { BeliefClass, DecayMode, DecayProfile } from '../types/belief.types';

export const DECAY_RATES: Record<DecayMode, number> = {
  no_decay: 0.0,
  slow: 0.001,
  normal: 0.01,
  fast: 0.02,
};

export const CLASS_DEFAULTS: Record<BeliefClass, Omit<DecayProfile, 'belief_class'>> = {
  axiom: {
    decay_mode: 'no_decay',
    decay_rate: 0.0,
    confidence_floor: 1.0,
    review_threshold: 1.0,
    archivable: false,
  },
  self_model: {
    decay_mode: 'slow',
    decay_rate: 0.001,
    confidence_floor: 0.9,
    review_threshold: 0.85,
    archivable: false,
  },
  user_model: {
    decay_mode: 'normal',
    decay_rate: 0.005,
    confidence_floor: 0.75,
    review_threshold: 0.8,
    archivable: true,
  },
  operational: {
    decay_mode: 'normal',
    decay_rate: 0.01,
    confidence_floor: 0.5,
    review_threshold: 0.7,
    archivable: true,
  },
  hypothesis: {
    decay_mode: 'fast',
    decay_rate: 0.02,
    confidence_floor: 0.3,
    review_threshold: 0.6,
    archivable: true,
  },
};

export const EXTRACTION_POLICY = {
  strongSignalConfidence: 0.8,
  weakSignalConfidence: 0.6,
  existingBeliefSimilarityThreshold: 0.7,
  reinforcementBoost: 0.03,
  autoPromoteMinExplicitMatchLength: 10,
} as const;

export const PROMOTION_POLICY = {
  promote: { minRecurrence: 3, minConfidenceProposal: 0.6 },
  defer: { exactRecurrence: 2, minConfidenceProposal: 0.65 },
  humanReviewValue: 'yes',
} as const;

export const INTROSPECTION_THRESHOLDS = {
  lowConfidenceThreshold: 0.7,
  stableReflectionThreshold: 0.85,
  reviewThreshold: 0.8,
} as const;

export const MS_PER_DAY = 86400000;
