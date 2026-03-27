import { Inject, Injectable, Logger } from "@nestjs/common";
import { Result, ok, err } from "neverthrow";
import { DomainError } from "../common/types/result.types";
import { SurrealService } from "../database/surreal.service";
import { EventsService } from "../events/events.service";
import { LLM_PORT } from "../llm/llm-port.token";
import { LlmDecisionPolicyService } from "../llm/llm-decision-policy.service";
import { LLMPort } from "../llm/types/llm-port.types";
import { LlmOperationType, LlmPriority } from "../llm/types/llm.types";
import { DissensusService } from "../policy/services/dissensus.service";
import { RipenessService } from "../policy/services/ripeness.service";
import { IntentNormalizerService } from "../policy/services/intent-normalizer.service";
import {
  Deliberation,
  DeliberationResult,
  DeliberationOption,
} from "../common/types/deliberation.types";
import { Intention } from "../common/types/intention.types";
import { Knowledge } from "../common/types/knowledge.types";
import { EpisodeService } from "../experience/episode.service";
import { Episode } from "../common/types/episode.types";
import { CausalGraphService } from "../cognitive/causal-graph.service";
import { TemporalCognitionService } from "../cognitive/temporal-cognition.service";

const SYSTEM_PROMPT = `You are the deliberation module of a cognitive agent called DEUS.
Given an intention to advance, relevant knowledge, and PAST EPISODE HISTORY, generate 2-3 approaches.

For each approach:
- Describe what to do
- Estimate success probability (0-1) — calibrate based on past episode outcomes
- Identify risks and prerequisites
- Classify as minimal/standard/thorough

Then select the BEST approach and explain your reasoning. Consider:
- What does the operator expect?
- What has WORKED before? (look at successful episodes)
- What has FAILED before? (avoid repeating failed strategies)
- What lessons were learned from past episodes?
- What could go wrong?
- Is this the right time to act?

CRITICAL: If past episodes show failures for similar intentions, explicitly address what went wrong and how your proposed approach avoids those pitfalls.`;

const DELIBERATE_TOOL = {
  name: "deliberate",
  description: "Generate and evaluate approaches for advancing an intention",
  input_schema: {
    type: "object" as const,
    properties: {
      options: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            description: { type: "string" as const },
            approach: {
              type: "string" as const,
              enum: ["minimal", "standard", "thorough"],
            },
            estimated_success: { type: "number" as const },
            estimated_cost: {
              type: "string" as const,
              enum: ["low", "medium", "high"],
            },
            risks: {
              type: "array" as const,
              items: { type: "string" as const },
            },
            prerequisites: {
              type: "array" as const,
              items: { type: "string" as const },
            },
          },
          required: ["description", "approach", "estimated_success", "risks"],
        },
      },
      selected: {
        type: "number" as const,
        description: "Index of selected option (0-based)",
      },
      reasoning: { type: "string" as const },
    },
    required: ["options", "selected", "reasoning"],
  },
};

@Injectable()
export class DeliberationService {
  private readonly logger = new Logger(DeliberationService.name);

  constructor(
    private readonly db: SurrealService,
    private readonly events: EventsService,
    @Inject(LLM_PORT) private readonly llm: LLMPort,
    private readonly llmDecision: LlmDecisionPolicyService,
    private readonly dissensus: DissensusService,
    private readonly ripeness: RipenessService,
    private readonly normalizer: IntentNormalizerService,
    private readonly episodes: EpisodeService,
    private readonly causalGraph: CausalGraphService,
    private readonly temporal: TemporalCognitionService,
  ) {}

  async deliberate(
    intention: Intention,
    context?: { knowledge?: Knowledge[] },
  ): Promise<Result<DeliberationResult, DomainError>> {
    const now = new Date().toISOString();

    let options: DeliberationOption[];
    let selectedOption: number;
    let reasoning: string;

    if (this.llm.isAvailable()) {
      // Fetch past episodes + causal prediction + temporal context in parallel
      const [pastEpisodes, causalPrediction, temporalContext] =
        await Promise.all([
          this.fetchRelevantEpisodes(intention),
          this.getCausalPrediction(intention.intention_id),
          this.getTemporalContext(intention),
        ]);

      // LLM deliberation with full cognitive context
      const llmResult = await this.llm.complete(
        this.llmDecision.buildRequest({
          operationType: LlmOperationType.DELIBERATION,
          reason: "intention_requires_deliberation",
          priorityOverride: "high",
          budgetClassOverride: "expensive_allowed",
          context: {
            self_state: intention,
            active_traces: context?.knowledge || [],
            recent_commits: pastEpisodes,
            world_snapshot: {
              causal_prediction: causalPrediction,
              temporal_context: temporalContext,
            },
          },
          prompt: {
            system_prompt: SYSTEM_PROMPT,
            user_message: this.buildUserMessage(
              intention,
              context?.knowledge || [],
              pastEpisodes,
              causalPrediction,
              temporalContext,
            ),
            tools: [DELIBERATE_TOOL],
            force_tool: "deliberate",
          },
          maxTokens: 1024,
        }),
      );

      if (llmResult.isOk()) {
        const data = llmResult.value.output_data as {
          options: DeliberationOption[];
          selected: number;
          reasoning: string;
        };
        if (
          !data ||
          !Array.isArray(data.options) ||
          data.options.length === 0
        ) {
          return this.fallbackDeliberation(intention);
        }
        options = data.options;
        selectedOption = data.selected;
        reasoning = data.reasoning;
      } else {
        // Fallback: single default option
        return this.fallbackDeliberation(intention);
      }
    } else {
      return this.fallbackDeliberation(intention);
    }

    // Safety check on selected option
    const selected = options[selectedOption] || options[0];
    const intent = this.normalizer.normalize({
      action_type: "write_internal",
      goal: intention.description,
      target: selected.description,
    });

    const dissensusResult = this.dissensus.evaluate(intent, null);
    const ripenessResult = this.ripeness.score(intent, null);

    const safetyPassed =
      dissensusResult.isOk() && dissensusResult.value.decision === "allow";

    const deliberation: Deliberation = {
      intention_id: intention.intention_id,
      trigger: "new_intention",
      options,
      selected_option: selectedOption,
      reasoning,
      commitment_level: safetyPassed ? "committed" : "tentative",
      safety_check: {
        dissensus: dissensusResult.isOk() ? dissensusResult.value : undefined!,
        ripeness: ripenessResult,
        passed: safetyPassed,
      },
      outcome: "pending",
      created_at: now,
    };

    // Persist
    await this.db.create(
      "deliberation",
      deliberation as unknown as Record<string, unknown>,
    );
    await this.events.emit("deliberation.decided", {
      intention_id: intention.intention_id,
      selected: selected.description,
      safety_passed: safetyPassed,
    });

    this.logger.log(
      `Deliberation for ${intention.intention_id}: selected "${selected.description}" (safety: ${safetyPassed})`,
    );

    return ok({
      deliberation,
      action_to_take: selected.description,
      safety_passed: safetyPassed,
    });
  }

  private fallbackDeliberation(
    intention: Intention,
  ): Result<DeliberationResult, DomainError> {
    const now = new Date().toISOString();
    const option: DeliberationOption = {
      description: `Execute: ${intention.description}`,
      approach: "standard",
      estimated_success: 0.7,
      estimated_cost: "medium",
      risks: ["No LLM available for nuanced planning"],
      prerequisites: [],
    };

    const deliberation: Deliberation = {
      intention_id: intention.intention_id,
      trigger: "new_intention",
      options: [option],
      selected_option: 0,
      reasoning: "Single option — LLM unavailable for deliberation",
      commitment_level: "tentative",
      outcome: "pending",
      created_at: now,
    };

    return ok({
      deliberation,
      action_to_take: option.description,
      safety_passed: true,
    });
  }

  /**
   * Fetch episodes relevant to this intention — both direct and semantically similar.
   * Prioritizes failures to learn from mistakes.
   */
  private async fetchRelevantEpisodes(
    intention: Intention,
  ): Promise<Episode[]> {
    // Direct: episodes for this intention
    const direct = await this.episodes.findByIntention(intention.intention_id);
    const directEps = direct.isOk() ? direct.value : [];

    // Recent: last 10 episodes across all intentions (for pattern matching)
    const recent = await this.episodes.findRecent(10);
    const recentEps = recent.isOk() ? recent.value : [];

    // Merge, deduplicate, prioritize failures
    const seen = new Set<string>();
    const all: Episode[] = [];
    for (const ep of [...directEps, ...recentEps]) {
      if (!seen.has(ep.episode_id)) {
        seen.add(ep.episode_id);
        all.push(ep);
      }
    }

    // Sort: failures first (most valuable for learning), then by recency
    return all
      .sort((a, b) => {
        if (a.outcome === "failure" && b.outcome !== "failure") return -1;
        if (b.outcome === "failure" && a.outcome !== "failure") return 1;
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      })
      .slice(0, 8);
  }

  /**
   * Causal graph prediction: what's the probability of success given current belief state?
   */
  private async getCausalPrediction(
    intentionId: string,
  ): Promise<string | null> {
    try {
      const graph = await this.causalGraph.build();
      if (graph.isErr() || graph.value.nodes.length === 0) return null;

      const prediction = this.causalGraph.predictGoalSuccess(
        intentionId,
        graph.value,
      );
      const topVOI = this.causalGraph.getTopVOIBeliefs(graph.value, 3);

      const parts: string[] = [];
      parts.push(
        `Causal prediction: ${(prediction.success_probability * 100).toFixed(0)}% success probability`,
      );
      if (prediction.blockers.length > 0) {
        parts.push(`Blockers: ${prediction.blockers.join(", ")}`);
      }
      if (topVOI.length > 0) {
        parts.push(
          `Highest-value-of-information beliefs (what to learn next): ${topVOI.map((v) => `${v.label} (VOI=${v.voi.toFixed(2)})`).join(", ")}`,
        );
      }
      return parts.join("\n");
    } catch {
      return null;
    }
  }

  /**
   * Temporal context: how long should this take? What's the urgency?
   * Learned from past episodes, not hardcoded.
   */
  private async getTemporalContext(
    intention: Intention,
  ): Promise<string | null> {
    try {
      const anticipation = await this.temporal.anticipate(
        intention.description,
      );
      if (anticipation.isErr()) return null;

      const a = anticipation.value;
      const perception = await this.temporal.perceive();
      const p = perception.isOk() ? perception.value : null;

      const parts: string[] = [];
      parts.push(
        `Expected effort: ~${a.expected_cycles} cognitive cycles (${a.basis})`,
      );
      parts.push(`Current urgency: ${(a.urgency * 100).toFixed(0)}%`);
      if (p) {
        parts.push(
          `System tempo: ${p.tempo} events/hour, time dilation: ${p.dilation}x, phase: ${p.phase}`,
        );
      }
      if (a.urgency > 0.7) {
        parts.push(
          "WARNING: This intention has consumed most of its expected cycles — consider escalating or simplifying",
        );
      }
      return parts.join("\n");
    } catch {
      return null;
    }
  }

  private buildUserMessage(
    intention: Intention,
    knowledge: Knowledge[],
    episodes: Episode[] = [],
    causalPrediction?: string | null,
    temporalContext?: string | null,
  ): string {
    const knowledgeContext =
      knowledge.length > 0
        ? `\n\nRelevant knowledge:\n${knowledge
            .slice(0, 15)
            .map((k) => `- [${k.knowledge_id}] ${k.content}`)
            .join("\n")}`
        : "";

    const episodeContext =
      episodes.length > 0
        ? `\n\nPast episodes (learn from these):\n${episodes
            .map((ep) => {
              const lessonsStr = (ep.lessons || [])
                .map((l: any) => `    - [${l.kind}] ${l.content}`)
                .join("\n");
              return `- [${ep.outcome.toUpperCase()}] ${ep.summary || ep.intention_id}${lessonsStr ? "\n" + lessonsStr : ""}`;
            })
            .join("\n")}`
        : "";

    const causalContext = causalPrediction
      ? `\n\nCausal analysis:\n${causalPrediction}`
      : "";

    const temporalCtx = temporalContext
      ? `\n\nTemporal perception:\n${temporalContext}`
      : "";

    return `Intention to advance:\n"${intention.description}"\n\nKind: ${intention.kind}\nSuccess criteria: ${intention.success_criteria}\nCurrent progress: ${intention.progress.estimated_completion * 100}%\nBlockers: ${intention.progress.blockers.join(", ") || "none"}${knowledgeContext}${episodeContext}${causalContext}${temporalCtx}`;
  }
}
