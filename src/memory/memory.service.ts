import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { EventsService } from '../events/events.service';
import { ActivityLogEntry, ActivityType } from '../common/types/memory.types';
import { LogActivityDto } from './dto/log-activity.dto';

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    private readonly db: SurrealService,
    private readonly events: EventsService,
  ) {}

  async logActivity(dto: LogActivityDto): Promise<Result<ActivityLogEntry, DomainError>> {
    const now = new Date();
    const entry: Record<string, unknown> = {
      type: dto.type,
      description: dto.description,
      context: dto.context || {},
      agent: 'DEUS',
      day_key: now.toISOString().slice(0, 10),
      timestamp: now.toISOString(),
    };

    const result = await this.db.create<ActivityLogEntry>('activity_log', entry as unknown as ActivityLogEntry);
    if (result.isOk()) {
      await this.events.emit('memory.logged', { type: dto.type, description: dto.description });
    }
    return result;
  }

  async logGit(description: string, context?: object): Promise<Result<ActivityLogEntry, DomainError>> {
    return this.logActivity({ type: 'git' as ActivityType, description, context: context as Record<string, unknown> });
  }

  async logCommand(description: string, context?: object): Promise<Result<ActivityLogEntry, DomainError>> {
    return this.logActivity({ type: 'command' as ActivityType, description, context: context as Record<string, unknown> });
  }

  async logDecision(description: string, reasoning?: string): Promise<Result<ActivityLogEntry, DomainError>> {
    return this.logActivity({ type: 'decision' as ActivityType, description, context: reasoning ? { reasoning } : undefined });
  }

  async logInteraction(description: string): Promise<Result<ActivityLogEntry, DomainError>> {
    return this.logActivity({ type: 'interaction' as ActivityType, description });
  }

  async logEvent(description: string, context?: object): Promise<Result<ActivityLogEntry, DomainError>> {
    return this.logActivity({ type: 'event' as ActivityType, description, context: context as Record<string, unknown> });
  }

  async search(query: string, limit = 20): Promise<Result<ActivityLogEntry[], DomainError>> {
    return this.db.query<ActivityLogEntry>(
      `SELECT * FROM activity_log WHERE description @@ $query ORDER BY timestamp DESC LIMIT $limit`,
      { query, limit },
    );
  }

  async getEntriesByDay(dayKey: string): Promise<Result<ActivityLogEntry[], DomainError>> {
    return this.db.query<ActivityLogEntry>(
      'SELECT * FROM activity_log WHERE day_key = $dayKey ORDER BY timestamp',
      { dayKey },
    );
  }

  async getRecentEntries(days = 7): Promise<Result<ActivityLogEntry[], DomainError>> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceKey = since.toISOString().slice(0, 10);

    return this.db.query<ActivityLogEntry>(
      'SELECT * FROM activity_log WHERE day_key >= $since ORDER BY timestamp DESC',
      { since: sinceKey },
    );
  }

  async countByDay(dayKey: string): Promise<Result<number, DomainError>> {
    const result = await this.db.query<{ count: number }>(
      'SELECT count() AS count FROM activity_log WHERE day_key = $dayKey GROUP ALL',
      { dayKey },
    );
    if (result.isErr()) return err(result.error);
    return ok(result.value[0]?.count ?? 0);
  }
}
