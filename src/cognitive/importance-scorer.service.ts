import { Injectable } from '@nestjs/common';
import { ImportanceScore } from '../common/types/cognitive.types';
import { ActivityLogEntry } from '../common/types/memory.types';
import { CognitiveConfigService } from './cognitive-config.service';
import { SimilarityProvider } from './similarity.provider';

const TYPE_IMPACT: Record<string, number> = {
  decision: 0.9, interaction: 0.8, git: 0.5, command: 0.3, event: 0.4,
};

@Injectable()
export class ImportanceScorerService {
  private recentDescriptions: string[] = [];

  constructor(
    private readonly config: CognitiveConfigService,
    private readonly similarity: SimilarityProvider,
  ) {}

  /**
   * Score the importance of an activity log entry for memory retention.
   * Combines weighted factors: impact (by type), uniqueness (vs recent entries),
   * relevance (to active goals), user involvement, and belief impact.
   *
   * @param entry - The activity log entry to score
   * @param context - Optional context with active goals and belief trigger flag
   * @returns Importance score (0-1) with factor breakdown
   */
  score(entry: ActivityLogEntry, context?: { activeGoals?: string[]; beliefTriggered?: boolean }): ImportanceScore {
    const factors = {
      impact: TYPE_IMPACT[entry.type] ?? 0.3,
      uniqueness: this.scoreUniqueness(entry),
      relevance: this.scoreRelevance(entry, context?.activeGoals || []),
      user_involvement: entry.type === 'interaction' ? 1.0 : entry.type === 'decision' ? 0.7 : 0.3,
      belief_impact: context?.beliefTriggered ? 1.0 : 0.0,
    };

    const score =
      factors.impact * this.config.get('importance.w_impact') +
      factors.uniqueness * this.config.get('importance.w_uniqueness') +
      factors.relevance * this.config.get('importance.w_relevance') +
      factors.user_involvement * this.config.get('importance.w_user_involvement') +
      factors.belief_impact * this.config.get('importance.w_belief_impact');

    this.recentDescriptions.push(entry.description);
    if (this.recentDescriptions.length > 100) this.recentDescriptions.shift();

    return { score: Math.round(Math.max(0, Math.min(1, score)) * 1000) / 1000, factors };
  }

  private scoreUniqueness(entry: ActivityLogEntry): number {
    if (this.recentDescriptions.length === 0) return 1.0;
    let maxOverlap = 0;
    for (const recent of this.recentDescriptions.slice(-20)) {
      const overlap = this.similarity.wordOverlap(entry.description, recent);
      if (overlap > maxOverlap) maxOverlap = overlap;
    }
    return 1.0 - maxOverlap;
  }

  private scoreRelevance(entry: ActivityLogEntry, activeGoals: string[]): number {
    if (activeGoals.length === 0) return 0.5;
    for (const goal of activeGoals) {
      if (this.similarity.wordOverlap(entry.description, goal) > 0.3) return 0.9;
    }
    return 0.3;
  }
}
