import { Injectable } from '@nestjs/common';
import { CognitiveConfigService } from './cognitive-config.service';

/**
 * Unified similarity provider. ALL similarity computations go through here.
 * No more duplicated cosine/Jaccard in 6 different files.
 */
@Injectable()
export class SimilarityProvider {
  constructor(private readonly config: CognitiveConfigService) {}

  /**
   * Cosine similarity between two vectors.
   * THE canonical implementation — no other file should have its own.
   */
  cosine(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length || a.length === 0) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  /**
   * Word-overlap Jaccard similarity between two strings.
   * THE canonical implementation — replaces 4+ copies across codebase.
   */
  wordOverlap(a: string, b: string, minWordLength = 3): number {
    const aWords = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > minWordLength));
    const bWords = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > minWordLength));
    if (aWords.size === 0 || bWords.size === 0) return 0;
    const intersection = [...aWords].filter((x) => bWords.has(x));
    return intersection.length / Math.max(aWords.size, bWords.size);
  }

  /**
   * Check if two strings are similar enough to be "the same concept".
   * Uses the configurable threshold from CognitiveConfigService.
   */
  isSimilar(a: string, b: string, configKey: string = 'similarity.belief_match'): boolean {
    return this.wordOverlap(a, b) >= this.config.get(configKey);
  }

  /**
   * Check if two vectors are similar enough.
   */
  isVectorSimilar(a: number[], b: number[], configKey: string = 'similarity.belief_match'): boolean {
    return this.cosine(a, b) >= this.config.get(configKey);
  }

  /**
   * Find best match in a list of candidates by word overlap.
   * Returns null if no match above threshold.
   */
  findBestWordMatch<T extends { content: string }>(
    query: string,
    candidates: T[],
    configKey: string = 'similarity.belief_match',
  ): T | null {
    const threshold = this.config.get(configKey);
    let best: T | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      const score = this.wordOverlap(query, candidate.content);
      if (score > bestScore && score >= threshold) {
        best = candidate;
        bestScore = score;
      }
    }

    return best;
  }
}
