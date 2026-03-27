import { Injectable } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { BeliefsService } from '../beliefs/beliefs.service';
import { MemoryService } from '../memory/memory.service';
import { HealthSummary } from '../common/types/health.types';

@Injectable()
export class HealthService {
  constructor(
    private readonly db: SurrealService,
    private readonly beliefs: BeliefsService,
    private readonly memory: MemoryService,
  ) {}

  async getHealth(): Promise<Result<HealthSummary, DomainError>> {
    const dbPing = await this.db.ping();
    const connected = dbPing.isOk();

    const beliefCount = await this.beliefs.count();
    const activeBeliefs = await this.beliefs.findByStatus('active');
    const recentEntries = await this.memory.getRecentEntries(1);

    const latestIntrospection = await this.db.query<{ generated_at: string }>(
      'SELECT generated_at FROM introspection_report ORDER BY generated_at DESC LIMIT 1',
    );

    const beliefTotal = beliefCount.isOk() ? beliefCount.value : 0;
    const activeCount = activeBeliefs.isOk() ? activeBeliefs.value.length : 0;
    const recentCount = recentEntries.isOk() ? recentEntries.value.length : 0;
    const latestDay = recentEntries.isOk() && recentEntries.value.length > 0
      ? recentEntries.value[0].day_key : null;
    const introDate = latestIntrospection.isOk() && latestIntrospection.value.length > 0
      ? latestIntrospection.value[0].generated_at : null;

    const status = !connected ? 'unhealthy'
      : beliefTotal === 0 ? 'degraded'
      : 'healthy';

    return ok({
      status,
      timestamp: new Date().toISOString(),
      database: { connected },
      beliefs: { count: beliefTotal, active: activeCount },
      memory: { recent_entries: recentCount, latest_day: latestDay },
      introspection: { latest_date: introDate },
    });
  }
}
