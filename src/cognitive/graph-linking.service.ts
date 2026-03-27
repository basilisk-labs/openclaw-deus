import { Injectable, Logger } from '@nestjs/common';
import { Result, ok } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';

/**
 * GraphLinkingService: Creates graph relations between cognitive entities.
 *
 * Centralizes all RELATE operations so that orchestrators
 * (pipeline, nightly, etc.) never touch the DB directly.
 */
@Injectable()
export class GraphLinkingService {
  private readonly logger = new Logger(GraphLinkingService.name);

  constructor(private readonly db: SurrealService) {}

  /** intention -> requires -> knowledge */
  async linkIntentionToKnowledge(intentionId: string, knowledgeId: string): Promise<Result<unknown, DomainError>> {
    return this.db.execute(
      `RELATE (SELECT id FROM intention WHERE intention_id = $iid LIMIT 1) -> requires -> (SELECT id FROM knowledge WHERE knowledge_id = $kid LIMIT 1)`,
      { iid: intentionId, kid: knowledgeId },
    );
  }

  /** intention -> blocked_by -> knowledge_gap */
  async linkIntentionToGap(intentionId: string, gapDescription: string): Promise<Result<unknown, DomainError>> {
    return this.db.execute(
      `RELATE (SELECT id FROM intention WHERE intention_id = $iid LIMIT 1) -> blocked_by -> (SELECT id FROM knowledge_gap WHERE description = $desc LIMIT 1)`,
      { iid: intentionId, desc: gapDescription },
    );
  }

  /** knowledge -> derived_from_episode -> episode */
  async linkKnowledgeToEpisode(knowledgeId: string, episodeId: string): Promise<Result<unknown, DomainError>> {
    return this.db.execute(
      `RELATE (SELECT id FROM knowledge WHERE knowledge_id = $kid LIMIT 1) -> derived_from_episode -> (SELECT id FROM episode WHERE episode_id = $eid LIMIT 1)`,
      { kid: knowledgeId, eid: episodeId },
    );
  }

  /** episode -> serves -> intention */
  async linkEpisodeToIntention(episodeId: string, intentionId: string): Promise<Result<unknown, DomainError>> {
    return this.db.execute(
      `RELATE (SELECT id FROM episode WHERE episode_id = $eid LIMIT 1) -> serves -> (SELECT id FROM intention WHERE intention_id = $iid LIMIT 1)`,
      { eid: episodeId, iid: intentionId },
    );
  }
}
