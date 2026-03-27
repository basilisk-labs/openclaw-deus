import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../../common/types/result.types';
import { IntentionService } from '../intention.service';
import { Intention, IntentionStatus } from '../../common/types/intention.types';

@Injectable()
export class IntentionStackService {
  private readonly logger = new Logger(IntentionStackService.name);

  constructor(private readonly intentions: IntentionService) {}

  /**
   * Get the intention stack: active intentions sorted by priority,
   * with their child hierarchies.
   */
  async getStack(): Promise<Result<Intention[], DomainError>> {
    return this.intentions.findActive();
  }

  /**
   * Check if a parent intention is complete (all children done).
   * If so, transition parent to completed.
   */
  async checkParentCompletion(childIntentionId: string): Promise<Result<void, DomainError>> {
    const child = await this.intentions.findById(childIntentionId);
    if (child.isErr() || !child.value.parent_id) return ok(undefined);

    const parent = await this.intentions.findById(child.value.parent_id);
    if (parent.isErr()) return ok(undefined);

    const children = await this.intentions.getChildren(parent.value.intention_id);
    if (children.isErr()) return ok(undefined);

    const allDone = children.value.every((c) =>
      ['completed', 'failed', 'abandoned'].includes(c.status),
    );

    if (allDone) {
      const anyFailed = children.value.some((c) => c.status === 'failed');
      const status = anyFailed ? 'failed' : 'completed';
      await this.intentions.transition(
        parent.value.intention_id,
        status as IntentionStatus,
        `All ${children.value.length} sub-intentions resolved`,
        'task_completion',
      );
      // Recursively check grandparent
      await this.checkParentCompletion(parent.value.intention_id);
    }

    return ok(undefined);
  }

  /**
   * Find intentions that are blocked for too long and surface them.
   */
  async findStaleIntentions(staleDays = 3): Promise<Result<Intention[], DomainError>> {
    const cutoff = new Date(Date.now() - staleDays * 86400000).toISOString();
    return this.intentions.findActive().then((r) => {
      if (r.isErr()) return r;
      return ok(r.value.filter((i) =>
        i.status === 'active' &&
        i.progress.blockers.length > 0 &&
        i.updated_at < cutoff,
      ));
    });
  }

  /**
   * Auto-adopt recognized intentions that have been waiting.
   */
  async autoAdopt(): Promise<Result<number, DomainError>> {
    const recognized = await this.intentions.findByStatus('recognized');
    if (recognized.isErr()) return err(recognized.error);

    let adopted = 0;
    for (const intention of recognized.value) {
      // Auto-adopt if recognized more than 1 minute ago (gives time for operator to cancel)
      const age = Date.now() - new Date(intention.recognized_at).getTime();
      if (age > 60000) {
        await this.intentions.transition(intention.intention_id, 'active', 'Auto-adopted after recognition delay', 'agent_deliberation');
        adopted++;
      }
    }
    return ok(adopted);
  }
}
