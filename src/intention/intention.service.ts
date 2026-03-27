import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError, NotFoundError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { EventsService } from '../events/events.service';
import { Intention, IntentionStatus, IntentionTransition } from '../common/types/intention.types';
import { DeusEvent } from '../common/types/events.types';

@Injectable()
export class IntentionService {
  private readonly logger = new Logger(IntentionService.name);
  private nextId = 1;

  constructor(
    private readonly db: SurrealService,
    private readonly events: EventsService,
  ) {}

  async create(data: Omit<Intention, 'id' | 'intention_id' | 'created_at' | 'updated_at'>): Promise<Result<Intention, DomainError>> {
    const intentionId = `INT${String(this.nextId++).padStart(3, '0')}`;
    const now = new Date().toISOString();

    const result = await this.db.create<Intention>('intention', {
      intention_id: intentionId,
      ...data,
      created_at: now,
      updated_at: now,
    } as unknown as Intention);

    if (result.isOk()) {
      await this.events.emit('intention.recognized', { intention_id: intentionId, description: data.description });
      this.logger.log(`Intention created: ${intentionId} — ${data.description}`);
    }
    return result;
  }

  async findById(intentionId: string): Promise<Result<Intention, DomainError>> {
    const result = await this.db.query<Intention>('SELECT * FROM intention WHERE intention_id = $id LIMIT 1', { id: intentionId });
    if (result.isErr()) return err(result.error);
    if (result.value.length === 0) return err(new NotFoundError('Intention', intentionId));
    return ok(result.value[0]);
  }

  async findActive(): Promise<Result<Intention[], DomainError>> {
    return this.db.query<Intention>(
      `SELECT * FROM intention WHERE status IN ['recognized', 'adopted', 'active', 'suspended'] ORDER BY priority DESC`,
    );
  }

  async findByStatus(status: IntentionStatus): Promise<Result<Intention[], DomainError>> {
    return this.db.query<Intention>('SELECT * FROM intention WHERE status = $status ORDER BY priority DESC', { status });
  }

  async transition(
    intentionId: string,
    toStatus: IntentionStatus,
    reason: string,
    triggeredBy: IntentionTransition['triggered_by'],
  ): Promise<Result<Intention, DomainError>> {
    const existing = await this.findById(intentionId);
    if (existing.isErr()) return err(existing.error);

    const intention = existing.value;
    const fromStatus = intention.status;

    // Record transition
    await this.db.create('intention_transition', {
      intention_id: intentionId,
      from_status: fromStatus,
      to_status: toStatus,
      reason,
      triggered_by: triggeredBy,
      timestamp: new Date().toISOString(),
    } as Record<string, unknown>);

    // Update intention
    const updateData: Record<string, unknown> = {
      status: toStatus,
      updated_at: new Date().toISOString(),
    };
    if (toStatus === 'adopted') updateData.adopted_at = new Date().toISOString();
    if (toStatus === 'completed' || toStatus === 'failed') updateData.completed_at = new Date().toISOString();
    if (toStatus === 'abandoned') updateData.abandoned_reason = reason;

    const updated = await this.db.update<Intention>(intention.id!, updateData);
    if (updated.isOk()) {
      const eventName = toStatus === 'completed' ? 'intention.completed'
        : toStatus === 'failed' ? 'intention.failed'
        : toStatus === 'abandoned' ? 'intention.abandoned'
        : 'intention.adopted';
      await this.events.emit(eventName as DeusEvent, { intention_id: intentionId, from: fromStatus, to: toStatus, reason });
      this.logger.log(`Intention ${intentionId}: ${fromStatus} → ${toStatus} (${reason})`);
    }
    return updated;
  }

  async updateProgress(intentionId: string, progress: Partial<Intention['progress']>): Promise<Result<Intention, DomainError>> {
    const existing = await this.findById(intentionId);
    if (existing.isErr()) return err(existing.error);

    const current = existing.value.progress;
    return this.db.update<Intention>(existing.value.id!, {
      progress: { ...current, ...progress },
      updated_at: new Date().toISOString(),
    });
  }

  async getTopPriority(): Promise<Result<Intention | null, DomainError>> {
    const result = await this.db.query<Intention>(
      `SELECT * FROM intention WHERE status = 'active' ORDER BY priority DESC LIMIT 1`,
    );
    if (result.isErr()) return err(result.error);
    return ok(result.value[0] || null);
  }

  async getChildren(intentionId: string): Promise<Result<Intention[], DomainError>> {
    return this.db.query<Intention>('SELECT * FROM intention WHERE parent_id = $id ORDER BY priority DESC', { id: intentionId });
  }

  async count(status?: IntentionStatus): Promise<Result<number, DomainError>> {
    const sql = status
      ? 'SELECT count() AS count FROM intention WHERE status = $status GROUP ALL'
      : 'SELECT count() AS count FROM intention GROUP ALL';
    const result = await this.db.query<{ count: number }>(sql, status ? { status } : undefined);
    if (result.isErr()) return err(result.error);
    return ok(result.value[0]?.count ?? 0);
  }
}
