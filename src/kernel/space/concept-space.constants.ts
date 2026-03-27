/**
 * Constants for ConceptSpaceService.
 *
 * NO hardcoded antonyms or linguistic knowledge.
 * Conflicts are detected from DATA: spatial proximity + low content overlap.
 * The system discovers its own distinctions.
 */

/** Minimum word length for content comparison (filter noise words). */
export const MIN_WORD_LENGTH = 3;

/** Content overlap threshold below which two nearby traces are considered conflicting. */
export const CONFLICT_OVERLAP_THRESHOLD = 0.3;

/** Minimum shared context words to confirm traces are about the same domain. */
export const MIN_SHARED_CONTEXT = 1;
