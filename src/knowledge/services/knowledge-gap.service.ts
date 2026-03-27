import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../../common/types/result.types';
import { SurrealService } from '../../database/surreal.service';
import { EventsService } from '../../events/events.service';
import { KnowledgeGap } from '../../common/types/knowledge.types';

@Injectable()
export class KnowledgeGapService {
  private readonly logger = new Logger(KnowledgeGapService.name);

  constructor(
    private readonly db: SurrealService,
    private readonly events: EventsService,
  ) {}

  async create(data: { description: string; domain: string; impact: number; resolution_strategy: string }): Promise<Result<KnowledgeGap, DomainError>> {
    // Check for existing similar gap
    const existing = await this.db.query<KnowledgeGap>(
      `SELECT * FROM knowledge_gap WHERE description = $desc AND status = 'open' LIMIT 1`,
      { desc: data.description },
    );
    if (existing.isOk() && existing.value.length > 0) {
      return ok(existing.value[0]); // already tracked
    }

    const result = await this.db.create<KnowledgeGap>('knowledge_gap', {
      ...data,
      blocks_intentions: [],
      status: 'open',
      discovered_at: new Date().toISOString(),
    } as unknown as KnowledgeGap);

    if (result.isOk()) {
      await this.events.emit('knowledge_gap.discovered', { description: data.description, impact: data.impact });
      this.logger.log(`Knowledge gap discovered: ${data.description} (impact: ${data.impact})`);
    }
    return result;
  }

  async resolve(gapId: string, resolvedByKnowledgeId: string): Promise<Result<void, DomainError>> {
    await this.db.update(gapId, {
      status: 'resolved',
      resolved_by: resolvedByKnowledgeId,
    });
    await this.events.emit('knowledge_gap.resolved', { gap_id: gapId, resolved_by: resolvedByKnowledgeId });
    return ok(undefined);
  }

  async findOpen(): Promise<Result<KnowledgeGap[], DomainError>> {
    return this.db.query<KnowledgeGap>(`SELECT * FROM knowledge_gap WHERE status = 'open' ORDER BY impact DESC`);
  }

  async findHighImpact(threshold = 0.7): Promise<Result<KnowledgeGap[], DomainError>> {
    return this.db.query<KnowledgeGap>(
      `SELECT * FROM knowledge_gap WHERE status = 'open' AND impact >= $threshold ORDER BY impact DESC`,
      { threshold },
    );
  }

  /**
   * Triage open gaps: close stale, track stats.
   * (Proposed by DiagnosisService — cognitive self-modification)
   */
  async triageGaps(staleDays = 14): Promise<Result<{ closed_stale: number; remaining: number }, DomainError>> {
    // Close gaps older than staleDays with no linked intentions
    const staleResult = await this.db.execute(
      `UPDATE knowledge_gap SET status = 'stale_closed' WHERE status = 'open' AND discovered_at < time::now() - $days AND array::len(blocks_intentions) = 0`,
      { days: `${staleDays}d` },
    );

    const closedStale = staleResult.isOk() ? (Array.isArray(staleResult.value) ? (staleResult.value as unknown[]).length : 0) : 0;

    const remaining = await this.findOpen();
    const remainingCount = remaining.isOk() ? remaining.value.length : 0;

    if (closedStale > 0) {
      this.logger.log(`Gap triage: closed ${closedStale} stale gaps, ${remainingCount} remaining`);
    }

    return ok({ closed_stale: closedStale, remaining: remainingCount });
  }
}
