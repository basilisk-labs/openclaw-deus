import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../../common/types/result.types';
import { Belief, ExtractionCandidate, ExtractionStats } from '../../common/types/belief.types';
import { EXTRACTION_PATTERNS, hasExtractionSignal } from '../../common/constants/extraction.constants';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';
import { SimilarityProvider } from '../../cognitive/similarity.provider';
import { BayesianUpdaterService } from '../../cognitive/bayesian-updater.service';
import { MemoryAggregationService } from '../../memory/services/memory-aggregation.service';
import { BeliefsService } from '../beliefs.service';
import { BeliefPromotionService } from './belief-promotion.service';

@Injectable()
export class BeliefExtractionService {
  private readonly logger = new Logger(BeliefExtractionService.name);

  constructor(
    private readonly beliefs: BeliefsService,
    private readonly promotion: BeliefPromotionService,
    private readonly memoryAggregation: MemoryAggregationService,
    private readonly config: CognitiveConfigService,
    private readonly similarity: SimilarityProvider,
    private readonly bayesian: BayesianUpdaterService,
  ) {}

  async extractFromMemory(sinceDay?: string): Promise<Result<ExtractionStats, DomainError>> {
    const since = sinceDay || this.daysAgo(7);
    const entries = await this.memoryAggregation.getDailyMemoriesSince(since);

    if (entries.isErr()) return err(entries.error);
    if (entries.value.length === 0) {
      return ok({ timestamp: new Date().toISOString(), files_processed: 0, extracted: 0, updated: 0, deferred: 0, total_beliefs: 0 });
    }

    const allBeliefs = await this.beliefs.findAll();
    if (allBeliefs.isErr()) return err(allBeliefs.error);
    const beliefs = allBeliefs.value;

    let extracted = 0, updated = 0, deferred = 0;

    for (const memory of entries.value) {
      // Flatten sections into one text block
      const content = Object.values(memory.sections || {})
        .flat()
        .join('\n');

      const candidates = this.extractCandidates(content, memory.day_key);

      for (const candidate of candidates) {
        const existing = this.findExistingBelief(beliefs, candidate.content);

        if (existing) {
          // Bayesian reinforcement: evidence-weighted boost instead of fixed increment
          const evidenceQuality = candidate.autoPromote ? 'strong_implication' as const : 'behavioral_pattern' as const;
          const boost = this.bayesian.reinforcementBoost(existing.confidence, evidenceQuality);
          existing.confidence = Math.min(1.0, existing.confidence + boost);
          existing.timestamp_updated = new Date().toISOString();
          existing.drift_history.push({
            timestamp: new Date().toISOString(),
            confidence: existing.confidence,
            reason: 'reinforced_by_new_evidence',
            source: memory.day_key,
          });
          await this.beliefs.update(existing.belief_id, {
            confidence: existing.confidence,
          });
          updated++;
        } else if (candidate.autoPromote) {
          // Auto-promote strong signals
          const result = await this.beliefs.create({
            content: candidate.content,
            confidence: candidate.confidence,
            evidence_set: [memory.day_key],
            source_type: 'inference',
            belief_class: 'operational',
            decay_mode: 'normal',
            confidence_floor: 0.5,
            review_threshold: 0.7,
            context_scope: candidate.category,
            inference_trace: ['pattern_extraction', `keyword_match_${candidate.type}`, 'auto_promote_strong_signal'],
          });
          if (result.isOk()) {
            beliefs.push(result.value);
            extracted++;
          }
        } else {
          // Defer to review queue
          await this.promotion.addToReviewQueue({
            content: candidate.content,
            confidence_proposal: candidate.confidence,
            source: memory.day_key,
            category: candidate.category,
            prefix: candidate.prefix,
          });
          deferred++;
        }
      }
    }

    return ok({
      timestamp: new Date().toISOString(),
      files_processed: entries.value.length,
      extracted,
      updated,
      deferred,
      total_beliefs: beliefs.length,
    });
  }

  extractCandidates(content: string, source: string): ExtractionCandidate[] {
    const candidates: ExtractionCandidate[] = [];

    for (const [type, config] of Object.entries(EXTRACTION_PATTERNS)) {
      for (const pattern of config.patterns) {
        // Reset regex state
        const regex = new RegExp(pattern.source, pattern.flags);
        let match: RegExpExecArray | null;

        while ((match = regex.exec(content)) !== null) {
          const matchedContent = match[1]?.trim();
          if (!matchedContent || matchedContent.length < 5) continue;

          const hasStrongSignal = hasExtractionSignal(matchedContent);
          // Bayesian prior based on evidence quality, not hardcoded
          const evidenceQuality = hasStrongSignal ? 'strong_implication' as const : 'weak_inference' as const;
          const prior = this.bayesian.computePrior('operational', 1);
          const updated = this.bayesian.updateWithEvidence(prior, evidenceQuality, 1);
          const confidence = updated.point;

          candidates.push({
            content: matchedContent,
            confidence,
            category: config.category,
            prefix: config.prefix,
            type,
            autoPromote: hasStrongSignal && matchedContent.length > 10,
          });
        }
      }
    }

    return candidates;
  }

  findExistingBelief(beliefs: Belief[], content: string): Belief | null {
    return this.similarity.findBestWordMatch(content, beliefs as Array<{ content: string }>, 'similarity.belief_match') as Belief | null;
  }

  calculateSimilarity(a: string, b: string): number {
    return this.similarity.wordOverlap(a, b);
  }

  private daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }
}
