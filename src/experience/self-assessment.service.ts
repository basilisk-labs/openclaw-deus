import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { EventsService } from '../events/events.service';
import { SelfAssessment } from '../common/types/episode.types';

@Injectable()
export class SelfAssessmentService {
  private readonly logger = new Logger(SelfAssessmentService.name);

  constructor(
    private readonly db: SurrealService,
    private readonly events: EventsService,
  ) {}

  async updateFromEpisodes(): Promise<Result<SelfAssessment[], DomainError>> {
    // Multi-domain assessment: group episodes by intention domain
    // First: get domain-specific stats by joining episodes with their intentions' knowledge domains
    const domainStats = await this.db.query<{ domain: string; total: number; successes: number; episode_ids: string[] }>(
      `SELECT
        domain,
        count() AS total,
        count(outcome IN ['success', 'partial_success']) AS successes,
        array::group(episode_id) AS episode_ids
      FROM (
        SELECT episode_id, outcome, created_at,
          (SELECT domain FROM knowledge WHERE knowledge_id IN $parent.relevant_knowledge_ids LIMIT 1)[0].domain ?? 'general' AS domain
        FROM episode
        WHERE created_at > time::now() - 30d
      )
      GROUP BY domain`,
    );

    // Fallback: if domain query fails, use simple aggregate
    const stats = domainStats.isOk() && domainStats.value.length > 0
      ? domainStats
      : await this.db.query<{ domain: string; total: number; successes: number; episode_ids: string[] }>(
          `SELECT
            'general' AS domain,
            count() AS total,
            count(outcome IN ['success', 'partial_success']) AS successes,
            array::group(episode_id) AS episode_ids
          FROM episode
          WHERE created_at > time::now() - 30d
          GROUP ALL`,
        );

    if (stats.isErr()) return err(stats.error);
    const assessments: SelfAssessment[] = [];

    for (const stat of stats.value) {
      if (stat.total < 3) continue; // not enough data

      const skillLevel = stat.successes / stat.total;
      const existing = await this.db.query<SelfAssessment>(
        'SELECT * FROM self_assessment WHERE domain = $domain LIMIT 1',
        { domain: stat.domain },
      );

      const previousLevel = existing.isOk() && existing.value.length > 0
        ? existing.value[0].skill_level : 0.5;

      const trend = skillLevel > previousLevel + 0.05 ? 'improving'
        : skillLevel < previousLevel - 0.05 ? 'declining' : 'stable';

      const assessment: Record<string, unknown> = {
        domain: stat.domain,
        skill_level: Math.round(skillLevel * 1000) / 1000,
        basis: `${stat.successes}/${stat.total} successful in last 30 days`,
        common_mistakes: [],
        improvement_trend: trend,
        episode_ids: stat.episode_ids || [],
        updated_at: new Date().toISOString(),
      };

      if (existing.isOk() && existing.value.length > 0) {
        await this.db.update(existing.value[0].id!, assessment);
        assessments.push({ ...existing.value[0], ...assessment } as SelfAssessment);
      } else {
        const r = await this.db.create<SelfAssessment>('self_assessment', assessment as unknown as SelfAssessment);
        if (r.isOk()) assessments.push(r.value);
      }
    }

    if (assessments.length > 0) {
      await this.events.emit('self_assessment.updated', { domains: assessments.map((a) => a.domain) });
    }

    return ok(assessments);
  }

  async findAll(): Promise<Result<SelfAssessment[], DomainError>> {
    return this.db.query<SelfAssessment>('SELECT * FROM self_assessment ORDER BY domain');
  }
}
