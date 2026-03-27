import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../../common/types/result.types';
import { SurrealService } from '../../database/surreal.service';
import { Belief, PromotionStats, ReviewCandidate } from '../../common/types/belief.types';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';
import { SimilarityProvider } from '../../cognitive/similarity.provider';
import { BeliefsService } from '../beliefs.service';

@Injectable()
export class BeliefPromotionService {
  private readonly logger = new Logger(BeliefPromotionService.name);

  constructor(
    private readonly beliefs: BeliefsService,
    private readonly db: SurrealService,
    private readonly config: CognitiveConfigService,
    private readonly similarity: SimilarityProvider,
  ) {}

  async runPromotionReview(): Promise<Result<PromotionStats, DomainError>> {
    const pendingResult = await this.getPendingCandidates();
    if (pendingResult.isErr()) return err(pendingResult.error);

    const candidates = pendingResult.value;
    let promoted = 0, deferred = 0, rejected = 0, refreshed = 0;

    // Fetch all beliefs ONCE before the loop (fixes N+1)
    const allBeliefsResult = await this.beliefs.findAll();
    const allBeliefs = allBeliefsResult.isOk() ? allBeliefsResult.value : [];

    for (const candidate of candidates) {
      const decision = this.decidePromotion(candidate);

      if (decision === 'promote') {
        const existing = this.similarity.findBestWordMatch(candidate.content, allBeliefs as Array<{ content: string; confidence: number; belief_id: string }>, 'similarity.belief_match');

        if (existing) {
          // Refresh existing belief
          existing.confidence = Math.min(1.0, existing.confidence + this.config.get('promotion.confidence_boost'));
          await this.beliefs.update(existing.belief_id, {
            confidence: existing.confidence,
          });
          refreshed++;
        } else {
          // Create new belief
          await this.beliefs.create({
            content: candidate.content,
            confidence: candidate.confidence_proposal,
            evidence_set: [candidate.source],
            source_type: 'inference',
            belief_class: 'operational',
            decay_mode: 'normal',
            confidence_floor: 0.5,
            review_threshold: 0.7,
            context_scope: candidate.category,
          });
          promoted++;
        }

        await this.updateCandidateStatus(candidate, 'promoted');
      } else if (decision === 'defer') {
        await this.updateCandidateStatus(candidate, 'deferred');
        deferred++;
      } else {
        await this.updateCandidateStatus(candidate, 'rejected');
        rejected++;
      }
    }

    return ok({
      timestamp: new Date().toISOString(),
      total_reviewed: candidates.length,
      promoted,
      deferred,
      rejected,
      refreshed,
    });
  }

  decidePromotion(candidate: ReviewCandidate): 'promote' | 'defer' | 'reject' {
    if (candidate.human_review_needed === 'yes') {
      return 'defer';
    }

    if (
      candidate.recurrence >= this.config.get('promotion.min_recurrence') &&
      candidate.confidence_proposal >= this.config.get('promotion.min_confidence')
    ) {
      return 'promote';
    }

    if (
      candidate.recurrence === this.config.get('promotion.defer_recurrence') &&
      candidate.confidence_proposal >= 0.65
    ) {
      return 'defer';
    }

    return 'reject';
  }

  async addToReviewQueue(data: {
    content: string;
    confidence_proposal: number;
    source: string;
    category: string;
    prefix: string;
  }): Promise<Result<ReviewCandidate, DomainError>> {
    const now = new Date().toISOString();

    // Check if similar candidate exists — increment recurrence
    const existing = await this.db.query<ReviewCandidate>(
      `SELECT * FROM review_candidate WHERE content = $content AND status = 'pending' LIMIT 1`,
      { content: data.content },
    );

    if (existing.isOk() && existing.value.length > 0) {
      const candidate = existing.value[0];
      return this.db.update<ReviewCandidate>(candidate.id!, {
        recurrence: candidate.recurrence + 1,
        updated_at: now,
      } as Partial<ReviewCandidate>);
    }

    return this.db.create<ReviewCandidate>('review_candidate', {
      content: data.content,
      confidence_proposal: data.confidence_proposal,
      recurrence: 1,
      source: data.source,
      category: data.category,
      prefix: data.prefix,
      human_review_needed: 'no',
      status: 'pending',
      created_at: now,
      updated_at: now,
    } as unknown as ReviewCandidate);
  }

  async getPendingCandidates(): Promise<Result<ReviewCandidate[], DomainError>> {
    return this.db.query<ReviewCandidate>(
      `SELECT * FROM review_candidate WHERE status = 'pending' ORDER BY recurrence DESC`,
    );
  }

  private async updateCandidateStatus(candidate: ReviewCandidate, status: string): Promise<void> {
    if (candidate.id) {
      await this.db.update(candidate.id, { status, updated_at: new Date().toISOString() });
    }
  }

  // calculateSimilarity removed — use SimilarityProvider.wordOverlap() instead
}
