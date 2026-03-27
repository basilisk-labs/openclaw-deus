import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { EventsService } from './events.service';
import { BeliefEvent, DeusEvent } from '../common/types/events.types';

@Injectable()
export class BeliefEventsService {
  private readonly logger = new Logger(BeliefEventsService.name);

  constructor(
    private readonly db: SurrealService,
    private readonly events: EventsService,
  ) {}

  async record(beliefId: string, eventType: BeliefEvent['event_type'], payload: Record<string, unknown>): Promise<Result<BeliefEvent, DomainError>> {
    const event: Record<string, unknown> = {
      belief_id: beliefId,
      event_type: eventType,
      payload,
      occurred_at: new Date().toISOString(),
    };

    const result = await this.db.create<BeliefEvent>('belief_event', event as unknown as BeliefEvent);

    // Emit WebSocket event
    this.events.emit(`belief.${eventType}` as DeusEvent, { belief_id: beliefId, ...payload });

    return result;
  }

  async getHistory(beliefId: string, from?: string, to?: string): Promise<Result<BeliefEvent[], DomainError>> {
    let sql = 'SELECT * FROM belief_event WHERE belief_id = $beliefId';
    const vars: Record<string, unknown> = { beliefId };

    if (from) {
      sql += ' AND occurred_at >= $from';
      vars.from = from;
    }
    if (to) {
      sql += ' AND occurred_at <= $to';
      vars.to = to;
    }

    sql += ' ORDER BY occurred_at';
    return this.db.query<BeliefEvent>(sql, vars);
  }

  async getRecentEvents(limit = 50): Promise<Result<BeliefEvent[], DomainError>> {
    return this.db.query<BeliefEvent>(
      'SELECT * FROM belief_event ORDER BY occurred_at DESC LIMIT $limit',
      { limit },
    );
  }
}
