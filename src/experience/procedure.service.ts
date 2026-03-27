import { Inject, Injectable, Logger } from "@nestjs/common";
import { Result, ok, err } from "neverthrow";
import { DomainError } from "../common/types/result.types";
import { SurrealService } from "../database/surreal.service";
import { Procedure } from "../common/types/episode.types";
import { LLM_PORT } from "../llm/llm-port.token";
import { LlmDecisionPolicyService } from "../llm/llm-decision-policy.service";
import { LLMPort } from "../llm/types/llm-port.types";
import { LlmOperationType, LlmPriority } from "../llm/types/llm.types";
import { CognitiveConfigService } from "../cognitive/cognitive-config.service";

@Injectable()
export class ProcedureService {
  private readonly logger = new Logger(ProcedureService.name);
  private nextId = 1;

  constructor(
    private readonly db: SurrealService,
    @Inject(LLM_PORT) private readonly llm: LLMPort,
    private readonly llmDecision: LlmDecisionPolicyService,
    private readonly config: CognitiveConfigService,
  ) {}

  async extractFromEpisodes(): Promise<Result<Procedure[], DomainError>> {
    // Find successful episodes with lessons
    const episodes = await this.db.query<{
      episode_id: string;
      summary: string;
      lessons: Array<{ content: string; kind: string }>;
    }>(
      `SELECT episode_id, summary, lessons, created_at FROM episode WHERE outcome IN ['success', 'partial_success'] AND array::len(lessons) > 0 ORDER BY created_at DESC LIMIT $limit`,
      { limit: this.config.get("query.episode_limit") },
    );
    if (episodes.isErr()) return err(episodes.error);
    if (episodes.value.length < 2) return ok([]);

    if (!this.llm.isAvailable()) return ok([]);

    const result = await this.llm.complete(
      this.llmDecision.buildRequest({
        operationType: LlmOperationType.PROCEDURE_EXTRACTION,
        reason: "successful_pattern_synthesis",
        priorityOverride: "low",
        context: {
          active_traces: episodes.value,
        },
        prompt: {
          system_prompt:
            "You are a knowledge extraction engine. Given successful task episodes, identify reusable procedures — step-by-step approaches that worked.",
          user_message: `Recent successful episodes:\n${episodes.value.map((e) => `- ${e.summary}\n  Lessons: ${e.lessons.map((l) => l.content).join("; ")}`).join("\n")}`,
          tools: [
            {
              name: "extract_procedures",
              description: "Extract reusable procedures from episodes",
              input_schema: {
                type: "object" as const,
                properties: {
                  procedures: {
                    type: "array" as const,
                    items: {
                      type: "object" as const,
                      properties: {
                        description: { type: "string" as const },
                        steps: {
                          type: "array" as const,
                          items: { type: "string" as const },
                        },
                        when_to_use: { type: "string" as const },
                        when_not_to_use: { type: "string" as const },
                      },
                      required: [
                        "description",
                        "steps",
                        "when_to_use",
                        "when_not_to_use",
                      ],
                    },
                  },
                },
                required: ["procedures"],
              },
            },
          ],
          force_tool: "extract_procedures",
        },
        maxTokens: 1024,
      }),
    );

    if (result.isErr()) return ok([]);
    const data = result.value.output_data as {
      procedures: Array<{
        description: string;
        steps: string[];
        when_to_use: string;
        when_not_to_use: string;
      }>;
    };
    if (!data || !Array.isArray(data.procedures)) return ok([]);

    // Compute success rate from source episodes
    const totalEpisodes = episodes.value.length;
    const successEpisodes = await this.db.query<{ c: number }>(
      `SELECT count() AS c FROM episode WHERE outcome = 'success' AND episode_id IN $eids GROUP ALL`,
      { eids: episodes.value.map((e) => e.episode_id) },
    );
    const successCount =
      successEpisodes.isOk() && successEpisodes.value.length > 0
        ? successEpisodes.value[0].c
        : 0;
    const computedSuccessRate =
      totalEpisodes > 0
        ? Math.round((successCount / totalEpisodes) * 100) / 100
        : 0.5;

    const created: Procedure[] = [];
    for (const proc of data.procedures) {
      const procId = `PROC${String(this.nextId++).padStart(3, "0")}`;
      const r = await this.db.create<Procedure>("procedure", {
        procedure_id: procId,
        description: proc.description,
        steps: proc.steps,
        when_to_use: proc.when_to_use,
        when_not_to_use: proc.when_not_to_use,
        success_rate: computedSuccessRate,
        episode_ids: episodes.value.map((e) => e.episode_id),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as unknown as Procedure);
      if (r.isOk()) created.push(r.value);
    }

    this.logger.log(
      `Extracted ${created.length} procedures from ${episodes.value.length} episodes`,
    );
    return ok(created);
  }

  async findAll(): Promise<Result<Procedure[], DomainError>> {
    return this.db.query<Procedure>(
      "SELECT * FROM procedure ORDER BY success_rate DESC",
    );
  }

  async findRelevant(
    description: string,
  ): Promise<Result<Procedure[], DomainError>> {
    return this.db.query<Procedure>(
      `SELECT * FROM procedure WHERE description @@ $q OR when_to_use @@ $q ORDER BY success_rate DESC LIMIT $limit`,
      { q: description, limit: this.config.get("query.procedure_limit") },
    );
  }
}
