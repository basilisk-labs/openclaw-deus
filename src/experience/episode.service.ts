import { Inject, Injectable, Logger } from "@nestjs/common";
import { Result, ok, err } from "neverthrow";
import { DomainError } from "../common/types/result.types";
import { SurrealService } from "../database/surreal.service";
import { EventsService } from "../events/events.service";
import { LLM_PORT } from "../llm/llm-port.token";
import { LlmDecisionPolicyService } from "../llm/llm-decision-policy.service";
import { LLMPort } from "../llm/types/llm-port.types";
import { LlmOperationType, LlmPriority } from "../llm/types/llm.types";
import { Episode, EpisodeOutcome, Lesson } from "../common/types/episode.types";
import { GraphLinkingService } from "../cognitive/graph-linking.service";

const SYSTEM_PROMPT = `You are the experience recording module of a cognitive agent.
Given a completed task/interaction and its context, create a structured episode record.

Focus on:
1. A concise summary of what happened
2. The outcome (success/partial_success/failure/abandoned)
3. Lessons learned — what should the agent remember for next time?
   - procedural: how-to knowledge
   - factual: new facts discovered
   - strategic: approach that worked or didn't`;

const RECORD_EPISODE_TOOL = {
  name: "record_episode",
  description: "Create structured episode from completed task",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string" as const },
      outcome: {
        type: "string" as const,
        enum: ["success", "partial_success", "failure", "abandoned"],
      },
      outcome_detail: { type: "string" as const },
      lessons: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            content: { type: "string" as const },
            kind: {
              type: "string" as const,
              enum: ["procedural", "factual", "strategic"],
            },
            confidence: { type: "number" as const },
            applicable_when: { type: "string" as const },
          },
          required: ["content", "kind", "confidence", "applicable_when"],
        },
      },
      operator_satisfaction: {
        type: "number" as const,
        description: "Inferred 0-1",
      },
    },
    required: ["summary", "outcome", "lessons"],
  },
};

@Injectable()
export class EpisodeService {
  private readonly logger = new Logger(EpisodeService.name);
  private nextId = 1;

  constructor(
    private readonly db: SurrealService,
    private readonly events: EventsService,
    @Inject(LLM_PORT) private readonly llm: LLMPort,
    private readonly llmDecision: LlmDecisionPolicyService,
    private readonly graphLinking: GraphLinkingService,
  ) {}

  async createFromCompletion(
    intentionId: string,
    context: string,
    outcome?: EpisodeOutcome,
  ): Promise<Result<Episode, DomainError>> {
    const episodeId = `EP${String(this.nextId++).padStart(3, "0")}`;
    const now = new Date().toISOString();

    let summary: string;
    let finalOutcome: EpisodeOutcome;
    let lessons: Lesson[];
    let satisfaction: number | undefined;

    if (this.llm.isAvailable()) {
      const result = await this.llm.complete(
        this.llmDecision.buildRequest({
          operationType: LlmOperationType.EPISODE_CREATION,
          reason: "experience_consolidation",
          priorityOverride: "medium",
          context: {
            input: context,
            self_state: { intention_id: intentionId, outcome },
          },
          prompt: {
            system_prompt: SYSTEM_PROMPT,
            user_message: `Task context:\n${context.slice(0, 3000)}\n\nIntention: ${intentionId}`,
            tools: [RECORD_EPISODE_TOOL],
            force_tool: "record_episode",
          },
          maxTokens: 1024,
        }),
      );

      if (result.isOk()) {
        const data = result.value.output_data as {
          summary: string;
          outcome: EpisodeOutcome;
          outcome_detail?: string;
          lessons: Lesson[];
          operator_satisfaction?: number;
        };
        if (data?.summary) {
          summary = data.summary;
          finalOutcome = data.outcome;
          lessons = data.lessons;
          satisfaction = data.operator_satisfaction;
        } else {
          summary = `Completed intention ${intentionId}`;
          finalOutcome = outcome || "success";
          lessons = [];
        }
      } else {
        summary = `Completed intention ${intentionId}`;
        finalOutcome = outcome || "success";
        lessons = [];
      }
    } else {
      summary = `Completed intention ${intentionId}`;
      finalOutcome = outcome || "success";
      lessons = [];
    }

    // Temporal chain: find predecessor episode for same intention
    let predecessorId: string | undefined;
    if (intentionId) {
      const prev = await this.findByIntention(intentionId);
      if (prev.isOk() && prev.value.length > 0) {
        predecessorId = prev.value[0].episode_id; // most recent
      }
    }

    const episode: Record<string, unknown> = {
      episode_id: episodeId,
      kind: "task_execution",
      summary,
      intention_id: intentionId,
      predecessor_episode_id: predecessorId,
      outcome: finalOutcome,
      lessons,
      operator_satisfaction: satisfaction,
      relevant_knowledge_ids: [],
      created_at: now,
      updated_at: now,
    };

    const result = await this.db.create<Episode>(
      "episode",
      episode as unknown as Episode,
    );
    if (result.isOk()) {
      await this.events.emit("episode.created", {
        episode_id: episodeId,
        outcome: finalOutcome,
        lessons_count: lessons.length,
      });
      if (intentionId) {
        await this.graphLinking.linkEpisodeToIntention(episodeId, intentionId);
      }
    }
    return result;
  }

  async findByIntention(
    intentionId: string,
  ): Promise<Result<Episode[], DomainError>> {
    return this.db.query<Episode>(
      "SELECT * FROM episode WHERE intention_id = $id ORDER BY created_at DESC",
      { id: intentionId },
    );
  }

  async findRecent(limit = 20): Promise<Result<Episode[], DomainError>> {
    return this.db.query<Episode>(
      "SELECT * FROM episode ORDER BY created_at DESC LIMIT $limit",
      { limit },
    );
  }

  async getSuccessRate(domain?: string): Promise<Result<number, DomainError>> {
    const sql = domain
      ? `SELECT count() AS total, count(outcome = 'success' OR outcome = 'partial_success') AS successes FROM episode WHERE relevant_knowledge_ids CONTAINS $domain GROUP ALL`
      : `SELECT count() AS total, count(outcome = 'success' OR outcome = 'partial_success') AS successes FROM episode GROUP ALL`;
    const result = await this.db.query<{ total: number; successes: number }>(
      sql,
      domain ? { domain } : undefined,
    );
    if (result.isErr()) return err(result.error);
    const data = result.value[0];
    if (!data || data.total === 0) return ok(0.5);
    return ok(data.successes / data.total);
  }
}
