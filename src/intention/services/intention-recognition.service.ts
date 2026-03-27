import { Inject, Injectable, Logger } from "@nestjs/common";
import { Result, ok, err } from "neverthrow";
import { DomainError } from "../../common/types/result.types";
import { LLM_PORT } from "../../llm/llm-port.token";
import { LlmDecisionPolicyService } from "../../llm/llm-decision-policy.service";
import { LLMPort } from "../../llm/types/llm-port.types";
import { LlmOperationType, LlmPriority } from "../../llm/types/llm.types";
import { IntentionService } from "../intention.service";
import {
  Intention,
  IntentionRecognitionResult,
  IntentionStatus,
  IntentionProgress,
} from "../../common/types/intention.types";
import { SimilarityProvider } from "../../cognitive/similarity.provider";

const SYSTEM_PROMPT = `You are the intention recognition module of a cognitive agent called DEUS.
Your job is to understand what the human operator is trying to achieve — not just what they say they want,
but the underlying goals driving their requests.

An intention is a commitment to achieve something. Intentions form hierarchies:
- "ship the auth feature" (goal) → "write the code" (task) → "fix the login bug" (sub_task)

Given the operator's message and the current active intentions, determine:
1. Does this create NEW intentions?
2. Does it UPDATE existing intentions (progress, priority, description)?
3. Does it COMPLETE or ABANDON any intentions?

Rules:
- Don't create an intention for every message — only for substantive goals/tasks
- Infer implicit intentions: if someone asks "can you fix the tests?", the intention is to have passing tests
- Detect when a request is a sub-task of an existing intention
- A question is not an intention unless it implies a goal ("how do I deploy?" → intention to deploy)`;

const RECOGNIZE_TOOL = {
  name: "update_intentions",
  description: "Update the intention state based on operator message analysis",
  input_schema: {
    type: "object" as const,
    properties: {
      new_intentions: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            description: { type: "string" as const },
            kind: {
              type: "string" as const,
              enum: ["goal", "task", "sub_task", "standing_order"],
            },
            source: {
              type: "string" as const,
              enum: ["operator_explicit", "operator_inferred"],
            },
            success_criteria: { type: "string" as const },
            parent_intention_id: { type: "string" as const },
            priority: { type: "number" as const },
            reasoning: { type: "string" as const },
          },
          required: [
            "description",
            "kind",
            "source",
            "success_criteria",
            "priority",
            "reasoning",
          ],
        },
      },
      updated_intentions: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            intention_id: { type: "string" as const },
            update: { type: "object" as const },
            reasoning: { type: "string" as const },
          },
          required: ["intention_id", "reasoning"],
        },
      },
      completed_intentions: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            intention_id: { type: "string" as const },
            outcome: {
              type: "string" as const,
              enum: ["completed", "failed", "abandoned"],
            },
            reasoning: { type: "string" as const },
          },
          required: ["intention_id", "outcome", "reasoning"],
        },
      },
    },
    required: ["new_intentions", "updated_intentions", "completed_intentions"],
  },
};

@Injectable()
export class IntentionRecognitionService {
  private readonly logger = new Logger(IntentionRecognitionService.name);

  constructor(
    @Inject(LLM_PORT) private readonly llm: LLMPort,
    private readonly llmDecision: LlmDecisionPolicyService,
    private readonly intentions: IntentionService,
    private readonly similarity: SimilarityProvider,
  ) {}

  /**
   * Analyze an operator message and update intentions accordingly.
   * This is the CRITICAL LLM call — it's how the agent understands what's happening.
   */
  async recognizeFromMessage(
    message: string,
  ): Promise<Result<IntentionRecognitionResult, DomainError>> {
    // Get current active intentions for context
    const activeResult = await this.intentions.findActive();
    const activeIntentions = activeResult.isOk() ? activeResult.value : [];

    // Skip if message is too short / trivial
    if (message.trim().length < 10) {
      return ok({
        new_intentions: [],
        updated_intentions: [],
        completed_intentions: [],
      });
    }

    if (!this.llm.isAvailable()) {
      return this.fallbackRecognition(message, activeIntentions);
    }

    const userMessage = this.buildUserMessage(message, activeIntentions);

    const result = await this.llm.complete(
      this.llmDecision.buildRequest({
        operationType: LlmOperationType.INTENTION_RECOGNITION,
        reason: "operator_query",
        priorityOverride: "high",
        budgetClassOverride: "expensive_allowed",
        context: {
          input: message,
          active_traces: activeIntentions,
        },
        prompt: {
          system_prompt: SYSTEM_PROMPT,
          user_message: userMessage,
          tools: [RECOGNIZE_TOOL],
          force_tool: "update_intentions",
        },
        maxTokens: 1024,
        operatorContext: true,
      }),
    );

    if (result.isErr()) {
      this.logger.warn(
        `LLM intention recognition failed, using fallback: ${result.error.message}`,
      );
      return this.fallbackRecognition(message, activeIntentions);
    }

    const recognition = result.value.output_data as IntentionRecognitionResult;
    if (!recognition || !Array.isArray(recognition.new_intentions)) {
      return this.fallbackRecognition(message, activeIntentions);
    }

    // Apply recognized changes
    await this.applyRecognition(recognition);

    return ok(recognition);
  }

  private async applyRecognition(
    recognition: IntentionRecognitionResult,
  ): Promise<void> {
    // Deduplicate: check if similar active intention already exists
    const activeResult = await this.intentions.findActive();
    const activeIntentions = activeResult.isOk() ? activeResult.value : [];

    // Create new intentions (with dedup)
    for (const newInt of recognition.new_intentions) {
      // Similarity check against existing active intentions
      const duplicate = this.similarity.findBestWordMatch(
        newInt.description,
        activeIntentions.map((i) => ({
          content: i.description,
          ...i,
        })) as Array<{ content: string }>,
        "similarity.belief_match", // reuse threshold (0.7)
      );

      if (duplicate) {
        // Reinforce existing intention's priority instead of creating duplicate
        const existing = duplicate as unknown as Intention;
        this.logger.log(
          `Intention dedup: "${newInt.description.slice(0, 50)}" matches existing ${existing.intention_id}`,
        );
        await this.intentions.updateProgress(existing.intention_id, {
          last_action: `Reinforced by new request: ${newInt.description.slice(0, 100)}`,
        });
        // Boost priority if new request has higher priority
        if (newInt.priority > (existing.priority || 0)) {
          await this.intentions.transition(
            existing.intention_id,
            existing.status,
            "priority_boost",
            "operator",
          );
        }
        continue;
      }

      await this.intentions.create({
        description: newInt.description,
        kind: newInt.kind,
        source: newInt.source,
        status: "recognized",
        parent_id: newInt.parent_intention_id,
        children_ids: [],
        success_criteria: newInt.success_criteria,
        progress: {
          estimated_completion: 0,
          last_action: "just recognized",
          blockers: [],
        },
        recognized_at: new Date().toISOString(),
        relevant_knowledge_ids: [],
        priority: newInt.priority,
      });
    }

    // Update existing intentions
    for (const update of recognition.updated_intentions) {
      if (update.update && typeof update.update === "object") {
        const upd = update.update as Record<string, unknown>;
        if (upd.progress) {
          await this.intentions.updateProgress(
            update.intention_id,
            upd.progress as Partial<IntentionProgress>,
          );
        }
        if (upd.status) {
          await this.intentions.transition(
            update.intention_id,
            upd.status as IntentionStatus,
            update.reasoning,
            "operator",
          );
        }
      }
    }

    // Complete/fail/abandon intentions
    for (const completed of recognition.completed_intentions) {
      await this.intentions.transition(
        completed.intention_id,
        completed.outcome as IntentionStatus,
        completed.reasoning,
        "operator",
      );
    }
  }

  /**
   * Fallback: simple pattern matching for intention recognition without LLM.
   */
  private fallbackRecognition(
    message: string,
    active: Intention[],
  ): Result<IntentionRecognitionResult, DomainError> {
    const lower = message.toLowerCase();
    const result: IntentionRecognitionResult = {
      new_intentions: [],
      updated_intentions: [],
      completed_intentions: [],
    };

    // Detect explicit task requests
    const taskPatterns = [
      /(?:can you|please|could you|I need you to|давай|сделай|напиши|исправь|добавь) (.+?)(?:\?|$)/i,
      /(?:let's|let us|we need to|нужно|надо) (.+?)(?:\.|$)/i,
    ];

    for (const pattern of taskPatterns) {
      const match = lower.match(pattern);
      if (match && match[1] && match[1].length > 10) {
        result.new_intentions.push({
          description: match[1].trim(),
          kind: "task",
          source: "operator_explicit",
          success_criteria: "Task completed as requested",
          priority: 0.7,
          reasoning:
            "Detected explicit task request via pattern matching (LLM unavailable)",
        });
        break; // one intention per message in fallback mode
      }
    }

    // Detect completion signals
    const completionSignals = [
      "done",
      "finished",
      "complete",
      "готово",
      "сделано",
      "хватит",
      "достаточно",
    ];
    if (completionSignals.some((s) => lower.includes(s)) && active.length > 0) {
      result.completed_intentions.push({
        intention_id: active[0].intention_id,
        outcome: "completed",
        reasoning: "Detected completion signal (LLM unavailable)",
      });
    }

    return ok(result);
  }

  private buildUserMessage(
    message: string,
    activeIntentions: Intention[],
  ): string {
    const intentionsContext =
      activeIntentions.length > 0
        ? `\n\nCurrently active intentions:\n${activeIntentions
            .map(
              (i) =>
                `- [${i.intention_id}] ${i.description} (${i.status}, priority: ${i.priority}, progress: ${i.progress.estimated_completion})`,
            )
            .join("\n")}`
        : "\n\nNo active intentions currently.";

    return `Operator message:\n"${message.slice(0, 3000)}"${intentionsContext}`;
  }
}
