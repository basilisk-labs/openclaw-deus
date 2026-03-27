import { Inject, Injectable, Logger } from "@nestjs/common";
import { Result, ok, err } from "neverthrow";
import { DomainError } from "../../common/types/result.types";
import { LLM_PORT } from "../../llm/llm-port.token";
import { LlmDecisionPolicyService } from "../../llm/llm-decision-policy.service";
import { LLMPort } from "../../llm/types/llm-port.types";
import { LlmOperationType, LlmPriority } from "../../llm/types/llm.types";
import { KnowledgeService } from "../knowledge.service";
import { KnowledgeGapService } from "./knowledge-gap.service";
import {
  Knowledge,
  KnowledgeExtractionResult,
} from "../../common/types/knowledge.types";
import {
  EXTRACTION_PATTERNS,
  hasExtractionSignal,
} from "../../common/constants/extraction.constants";

const SYSTEM_PROMPT = `You are the epistemic state manager of a cognitive agent called DEUS.
Given a recent interaction, extract KNOWLEDGE that should persist across sessions.

Knowledge is NOT preferences or likes/dislikes. It is:
- FACTS: validated information about the project, codebase, tools, domain
- INFERENCES: hypotheses derived from observations (mark with lower confidence)
- PROCEDURAL: how to do things ("deploy by running X", "tests require Y")
- META: patterns about how the operator works, communicates, makes decisions

For each piece of knowledge, assess:
- evidence_quality: how strong is the evidence? (explicit_statement > behavioral_pattern > weak_inference)
- confidence: how sure are you? Consider the evidence quality.
- domain: what area does this relate to?

Also identify KNOWLEDGE GAPS: what was revealed that the agent doesn't know but should?`;

const EXTRACT_TOOL = {
  name: "update_knowledge",
  description: "Extract and update knowledge from interaction",
  input_schema: {
    type: "object" as const,
    properties: {
      new_knowledge: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            content: { type: "string" as const },
            kind: {
              type: "string" as const,
              enum: ["fact", "inference", "procedural", "meta"],
            },
            domain: { type: "string" as const },
            confidence: { type: "number" as const },
            evidence_quality: {
              type: "string" as const,
              enum: [
                "explicit_statement",
                "strong_implication",
                "behavioral_pattern",
                "weak_inference",
              ],
            },
            reasoning: { type: "string" as const },
          },
          required: [
            "content",
            "kind",
            "domain",
            "confidence",
            "evidence_quality",
            "reasoning",
          ],
        },
      },
      updated_knowledge: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            knowledge_id: { type: "string" as const },
            update_type: {
              type: "string" as const,
              enum: ["reinforced", "revised", "contradicted"],
            },
            new_confidence: { type: "number" as const },
            reasoning: { type: "string" as const },
          },
          required: ["knowledge_id", "update_type", "reasoning"],
        },
      },
      knowledge_gaps: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            description: { type: "string" as const },
            domain: { type: "string" as const },
            impact: { type: "number" as const },
            resolution_strategy: { type: "string" as const },
          },
          required: ["description", "domain", "impact", "resolution_strategy"],
        },
      },
    },
    required: ["new_knowledge", "updated_knowledge", "knowledge_gaps"],
  },
};

@Injectable()
export class KnowledgeExtractionService {
  private readonly logger = new Logger(KnowledgeExtractionService.name);

  constructor(
    @Inject(LLM_PORT) private readonly llm: LLMPort,
    private readonly llmDecision: LlmDecisionPolicyService,
    private readonly knowledge: KnowledgeService,
    private readonly gaps: KnowledgeGapService,
  ) {}

  async extractFromInteraction(
    content: string,
  ): Promise<Result<KnowledgeExtractionResult, DomainError>> {
    // Skip trivial messages
    if (content.trim().length < 30) {
      return ok({
        new_knowledge: [],
        updated_knowledge: [],
        knowledge_gaps: [],
      });
    }

    // Get existing knowledge for context
    const existing = await this.knowledge.findAll({ status: "active" });
    const existingKnowledge = existing.isOk()
      ? existing.value.slice(0, 30)
      : [];

    if (!this.llm.isAvailable()) {
      return this.fallbackExtraction(content);
    }

    const userMessage = this.buildUserMessage(content, existingKnowledge);
    const cacheKey = `ke:${content.slice(0, 200)}`;

    const result = await this.llm.complete(
      this.llmDecision.buildRequest({
        operationType: LlmOperationType.KNOWLEDGE_EXTRACTION,
        reason: "operator_query",
        priorityOverride: "medium",
        context: {
          input: content,
          active_traces: existingKnowledge,
        },
        prompt: {
          system_prompt: SYSTEM_PROMPT,
          user_message: userMessage,
          tools: [EXTRACT_TOOL],
          force_tool: "update_knowledge",
        },
        maxTokens: 1024,
        cacheKey,
        cacheTtlMs: 4 * 3600_000,
        operatorContext: true,
      }),
    );

    if (result.isErr()) {
      this.logger.warn(
        `LLM knowledge extraction failed: ${result.error.message}`,
      );
      return this.fallbackExtraction(content);
    }

    const extraction = result.value.output_data as KnowledgeExtractionResult;
    if (!extraction || !Array.isArray(extraction.new_knowledge)) {
      return this.fallbackExtraction(content);
    }

    // Apply extraction results
    await this.applyExtraction(extraction, content);

    return ok(extraction);
  }

  private async applyExtraction(
    extraction: KnowledgeExtractionResult,
    sourceContent: string,
  ): Promise<void> {
    for (const item of extraction.new_knowledge) {
      // Check for similar existing knowledge
      const similar = await this.knowledge.findSimilar(item.content);
      if (similar.isOk() && similar.value.length > 0) {
        // Reinforce existing instead of creating new
        await this.knowledge.reinforce(similar.value[0].knowledge_id, {
          source: "interaction",
          quality: item.evidence_quality,
          timestamp: new Date().toISOString(),
          content: sourceContent.slice(0, 200),
        });
      } else {
        await this.knowledge.create({
          kind: item.kind,
          content: item.content,
          domain: item.domain,
          confidence: item.confidence,
          evidence: [
            {
              source: "interaction",
              quality: item.evidence_quality,
              timestamp: new Date().toISOString(),
              content: sourceContent.slice(0, 200),
            },
          ],
        });
      }
    }

    for (const update of extraction.updated_knowledge) {
      if (update.update_type === "reinforced") {
        await this.knowledge.reinforce(update.knowledge_id, {
          source: "interaction",
          quality: "strong_implication",
          timestamp: new Date().toISOString(),
          content: "Reinforced by recent interaction",
        });
      }
    }

    for (const gap of extraction.knowledge_gaps) {
      await this.gaps.create(gap);
    }
  }

  /**
   * Fallback: regex pattern extraction (degraded mode without LLM).
   * Creates inferences with low confidence.
   */
  private fallbackExtraction(
    content: string,
  ): Result<KnowledgeExtractionResult, DomainError> {
    const result: KnowledgeExtractionResult = {
      new_knowledge: [],
      updated_knowledge: [],
      knowledge_gaps: [],
    };

    if (!hasExtractionSignal(content)) return ok(result);

    for (const [, config] of Object.entries(EXTRACTION_PATTERNS)) {
      for (const pattern of config.patterns) {
        const regex = new RegExp(pattern.source, pattern.flags);
        let match: RegExpExecArray | null;
        while ((match = regex.exec(content)) !== null) {
          const matched = match[1]?.trim();
          if (!matched || matched.length < 5) continue;
          result.new_knowledge.push({
            content: matched,
            kind: "inference",
            domain: config.category,
            confidence: 0.5, // low confidence for regex extraction
            evidence_quality: "weak_inference",
            reasoning: "Regex pattern extraction (LLM unavailable)",
          });
        }
      }
    }
    return ok(result);
  }

  private buildUserMessage(content: string, existing: Knowledge[]): string {
    const context =
      existing.length > 0
        ? `\n\nExisting knowledge:\n${existing.map((k) => `- [${k.knowledge_id}] (${k.kind}) ${k.content}`).join("\n")}`
        : "";
    return `Recent interaction:\n---\n${content.slice(0, 4000)}\n---${context}`;
  }
}
