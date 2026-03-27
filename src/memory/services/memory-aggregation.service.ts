import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../../common/types/result.types';
import { SurrealService } from '../../database/surreal.service';
import { ActivityLogEntry, AggregateResult, DailyMemory, MemorySection } from '../../common/types/memory.types';
import { MemoryService } from '../memory.service';

@Injectable()
export class MemoryAggregationService {
  private readonly logger = new Logger(MemoryAggregationService.name);

  constructor(
    private readonly memory: MemoryService,
    private readonly db: SurrealService,
  ) {}

  async aggregateDay(dayKey?: string): Promise<Result<AggregateResult, DomainError>> {
    const day = dayKey || new Date().toISOString().slice(0, 10);
    const entries = await this.memory.getEntriesByDay(day);
    if (entries.isErr()) return err(entries.error);

    const sections: Record<string, string[]> = {
      'Git Activity': [],
      'Commands Executed': [],
      'Decisions': [],
      'Interactions': [],
      'System Events': [],
    };

    const sectionsUpdated = new Set<string>();

    for (const entry of entries.value) {
      const classified = this.classifyLogEntry(entry);
      sections[classified.section] = sections[classified.section] || [];
      sections[classified.section].push(classified.line);
      sectionsUpdated.add(classified.section);
    }

    // Upsert daily memory
    const now = new Date().toISOString();
    const existing = await this.db.query<DailyMemory>(
      'SELECT * FROM daily_memory WHERE day_key = $day LIMIT 1',
      { day },
    );

    if (existing.isOk() && existing.value.length > 0) {
      await this.db.update(existing.value[0].id!, {
        sections,
        entry_count: entries.value.length,
        generated_at: now,
      });
    } else {
      await this.db.create<DailyMemory>('daily_memory', {
        day_key: day,
        sections,
        entry_count: entries.value.length,
        generated_at: now,
      } as unknown as DailyMemory);
    }

    return ok({
      day_key: day,
      entries_processed: entries.value.length,
      sections_updated: [...sectionsUpdated],
    });
  }

  classifyLogEntry(entry: ActivityLogEntry): { section: MemorySection; line: string } {
    const description = entry.description || 'Operational event recorded';
    const type = (entry.type || '').toLowerCase();
    const text = JSON.stringify(entry).toLowerCase();

    if (type === 'git' || /commit|branch|merge|rebase|checkout/.test(text)) {
      return { section: 'Git Activity', line: description };
    }

    if (type === 'command' || /command|npm |node |git /.test(text)) {
      return { section: 'Commands Executed', line: description };
    }

    if (type === 'interaction') {
      return { section: 'Interactions', line: description };
    }

    if (type === 'decision' || /decision|updated|changed|defined/.test(text)) {
      return { section: 'Decisions', line: description };
    }

    return { section: 'System Events', line: description };
  }

  async getDailyMemoriesSince(sinceDay: string): Promise<Result<DailyMemory[], DomainError>> {
    return this.db.query<DailyMemory>(
      'SELECT * FROM daily_memory WHERE day_key >= $since ORDER BY day_key',
      { since: sinceDay },
    );
  }

  async getDailyMemory(dayKey: string): Promise<Result<DailyMemory | null, DomainError>> {
    const result = await this.db.query<DailyMemory>(
      'SELECT * FROM daily_memory WHERE day_key = $day LIMIT 1',
      { day: dayKey },
    );
    if (result.isErr()) return err(result.error);
    return ok(result.value[0] || null);
  }
}
