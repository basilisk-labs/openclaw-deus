import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../../common/types/result.types';
import { Belief, Contradiction, ContradictionStats } from '../../common/types/belief.types';
import { SurrealService } from '../../database/surreal.service';
import { EventsService } from '../../events/events.service';
import { BeliefsService } from '../beliefs.service';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';
import { SimilarityProvider } from '../../cognitive/similarity.provider';

@Injectable()
export class BeliefContradictionService {
  private readonly logger = new Logger(BeliefContradictionService.name);

  constructor(
    private readonly beliefs: BeliefsService,
    private readonly db: SurrealService,
    private readonly events: EventsService,
    private readonly config: CognitiveConfigService,
    private readonly similarity: SimilarityProvider,
  ) {}

  async scanForContradictions(): Promise<Result<ContradictionStats, DomainError>> {
    const allBeliefs = await this.beliefs.findAll();
    if (allBeliefs.isErr()) return err(allBeliefs.error);

    const beliefs = allBeliefs.value;
    const contradictions = this.findContradictions(beliefs);

    if (contradictions.length > 0) {
      const highSeverity = contradictions.filter((c) => c.severity === 'high');

      // Create graph relations in SurrealDB for all contradictions
      for (const contr of contradictions) {
        const b1 = beliefs.find((b) => b.belief_id === contr.belief_1);
        const b2 = beliefs.find((b) => b.belief_id === contr.belief_2);
        if (b1?.id && b2?.id) {
          await this.db.relate(b1.id, 'contradicts', b2.id, {
            severity: contr.severity,
            scope: contr.scope,
            detected_at: new Date().toISOString(),
          });
        }
      }

      if (highSeverity.length > 0) {
        this.resolveContradictions(contradictions, beliefs);
        // Batch update resolved beliefs
        for (const belief of beliefs) {
          if (belief.status === 'review_needed' && belief.id) {
            await this.db.batchUpdate(
              'UPDATE belief SET confidence = $conf, status = $status WHERE belief_id = $bid',
              { conf: belief.confidence, status: belief.status, bid: belief.belief_id },
            );
          }
        }
      }

      await this.events.emit('contradiction.detected', {
        total: contradictions.length,
        high_severity: highSeverity.length,
        pairs: contradictions.map((c) => ({ b1: c.belief_1, b2: c.belief_2, severity: c.severity })),
      });
    }

    return ok({
      timestamp: new Date().toISOString(),
      total_checked: beliefs.length,
      contradictions_found: contradictions.length,
      high_severity: contradictions.filter((c) => c.severity === 'high').length,
      medium_severity: contradictions.filter((c) => c.severity === 'medium').length,
    });
  }

  /** Query existing contradictions from graph */
  async getContradictionsFor(beliefId: string): Promise<Result<Contradiction[], DomainError>> {
    const result = await this.db.query<{
      in: { belief_id: string; content: string };
      out: { belief_id: string; content: string };
      severity: string;
      scope: string;
    }>(
      `SELECT in.belief_id, in.content, out.belief_id, out.content, severity, scope
       FROM contradicts
       WHERE in.belief_id = $id OR out.belief_id = $id`,
      { id: beliefId },
    );
    if (result.isErr()) return err(result.error);

    return ok(result.value.map((r) => ({
      belief_1: r.in.belief_id,
      belief_2: r.out.belief_id,
      content_1: r.in.content,
      content_2: r.out.content,
      severity: r.severity as 'high' | 'medium',
      scope: r.scope,
    })));
  }

  findContradictions(beliefs: Belief[]): Contradiction[] {
    const contradictions: Contradiction[] = [];
    const byScope: Record<string, Belief[]> = {};
    for (const b of beliefs) {
      const scope = b.context_scope || 'unknown';
      byScope[scope] = byScope[scope] || [];
      byScope[scope].push(b);
    }

    for (const [scope, scopeBeliefs] of Object.entries(byScope)) {
      for (let i = 0; i < scopeBeliefs.length; i++) {
        for (let j = i + 1; j < scopeBeliefs.length; j++) {
          const b1 = scopeBeliefs[i];
          const b2 = scopeBeliefs[j];
          if (b1.status === 'archived' || b2.status === 'archived') continue;

          if (this.isNegation(b1.content, b2.content)) {
            contradictions.push({ belief_1: b1.belief_id, belief_2: b2.belief_id,
              content_1: b1.content, content_2: b2.content, severity: 'high', scope });
          }

          if (this.isSimilarContent(b1.content, b2.content) && Math.abs(b1.confidence - b2.confidence) > this.config.get('contradiction.divergence_threshold')) {
            contradictions.push({ belief_1: b1.belief_id, belief_2: b2.belief_id,
              content_1: b1.content, content_2: b2.content, severity: 'medium', scope, reason: 'confidence_divergence' });
          }
        }
      }
    }
    return contradictions;
  }

  /**
   * Bayesian contradiction resolution: the belief with MORE/STRONGER evidence retains more confidence.
   * Instead of flat penalty to both, we redistribute confidence based on evidence strength.
   */
  resolveContradictions(contradictions: Contradiction[], beliefs: Belief[]): void {
    const now = new Date().toISOString();
    for (const contr of contradictions) {
      if (contr.severity !== 'high') continue;
      const b1 = beliefs.find((b) => b.belief_id === contr.belief_1);
      const b2 = beliefs.find((b) => b.belief_id === contr.belief_2);
      if (!b1 || !b2) continue;

      const basePenalty = this.config.get('contradiction.confidence_penalty');

      // Evidence-weighted resolution: more evidence = less penalty
      const ev1 = (b1.evidence_set || []).length;
      const ev2 = (b2.evidence_set || []).length;
      const totalEv = Math.max(1, ev1 + ev2);

      // Belief with more evidence gets lighter penalty
      const penalty1 = basePenalty + (1 - basePenalty) * (ev1 / totalEv) * 0.5; // closer to 1.0 = less penalty
      const penalty2 = basePenalty + (1 - basePenalty) * (ev2 / totalEv) * 0.5;

      b1.confidence *= penalty1;
      b2.confidence *= penalty2;

      // Only the weaker-evidenced belief goes to review
      if (ev1 < ev2) {
        b1.status = 'review_needed';
      } else if (ev2 < ev1) {
        b2.status = 'review_needed';
      } else {
        b1.status = 'review_needed'; b2.status = 'review_needed';
      }

      b1.drift_history.push({ timestamp: now, confidence: b1.confidence, reason: `bayesian_contradiction_resolution(ev=${ev1})`, with: contr.belief_2 });
      b2.drift_history.push({ timestamp: now, confidence: b2.confidence, reason: `bayesian_contradiction_resolution(ev=${ev2})`, with: contr.belief_1 });
    }
  }

  isNegation(content1: string, content2: string): boolean {
    const negations = ['не ', 'нет', 'никогда', 'всегда', 'not ', 'never', 'no '];
    const c1 = content1.toLowerCase();
    const c2 = content2.toLowerCase();
    const threshold = this.config.get('similarity.contradiction_negation');
    for (const neg of negations) {
      if ((c1.includes(neg) && !c2.includes(neg)) || (!c1.includes(neg) && c2.includes(neg))) {
        const base1 = c1.replace(new RegExp(neg, 'g'), '').trim();
        const base2 = c2.replace(new RegExp(neg, 'g'), '').trim();
        if (this.similarity.wordOverlap(base1, base2) > threshold) return true;
      }
    }
    return false;
  }

  isSimilarContent(c1: string, c2: string): boolean {
    return this.similarity.wordOverlap(c1, c2) > this.config.get('similarity.contradiction_content');
  }
}
