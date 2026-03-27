import { Injectable, Logger } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import { DomainError, Result, err, ok } from "../common/types/result.types";
import { LLMPort, LLMRequest, LLMResponse } from "./types/llm-port.types";
import { LlmError } from "./llm.errors";

const RETRY_DELAYS = [0, 1000, 4000, 16000];
const RETRYABLE_STATUSES = [429, 500, 529];

@Injectable()
export class DirectLLMAdapter implements LLMPort {
  private readonly logger = new Logger(DirectLLMAdapter.name);
  private readonly client: Anthropic | null;
  private readonly maxConcurrency: number;
  private concurrency = 0;
  private queue: Array<{ resolve: () => void; priority: number }> = [];

  constructor() {
    const apiKey = process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY;
    this.maxConcurrency = parseInt(process.env.LLM_MAX_CONCURRENCY || "2", 10);
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async complete(
    request: LLMRequest,
  ): Promise<Result<LLMResponse, DomainError>> {
    if (!this.client) {
      return err(
        new LlmError("Direct LLM adapter unavailable — API key not configured"),
      );
    }

    await this.acquireSlot(this.priorityToWeight(request.priority));

    try {
      const start = Date.now();
      const result = await this.callWithRetry(request);
      if (result.isErr()) {
        return err(result.error);
      }

      const latencyMs = Date.now() - start;
      return ok({
        ...result.value,
        latency_ms: latencyMs,
        provider: result.value.provider || "anthropic",
      });
    } finally {
      this.releaseSlot();
    }
  }

  private async callWithRetry(
    request: LLMRequest,
  ): Promise<Result<LLMResponse, DomainError>> {
    const maxRetries = request.priority === "high" ? 4 : 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAYS[attempt] || 16000),
        );
      }

      try {
        const tools = (request.prompt.tools || []).map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.input_schema as Anthropic.Tool.InputSchema,
        }));

        const model = this.selectModel(request);
        const response = await this.client!.messages.create({
          model,
          max_tokens: request.max_tokens || 1024,
          system: [
            {
              type: "text" as const,
              text: request.prompt.system_prompt,
              cache_control: { type: "ephemeral" as const },
            },
          ],
          messages: [{ role: "user", content: request.prompt.user_message }],
          temperature: request.temperature,
          tools,
          tool_choice: request.prompt.force_tool
            ? { type: "tool" as const, name: request.prompt.force_tool }
            : { type: "auto" as const },
        });

        const text = response.content
          .filter((block) => block.type === "text")
          .map((block) => ("text" in block ? block.text : ""))
          .join("\n")
          .trim();
        const toolUse = response.content.find(
          (block) => block.type === "tool_use",
        );
        const outputData =
          toolUse && "input" in toolUse
            ? toolUse.input
            : this.tryParseTextPayload(text);

        return ok({
          output_text: text || (outputData ? JSON.stringify(outputData) : ""),
          output_data: outputData || undefined,
          usage: {
            prompt_tokens: response.usage.input_tokens,
            completion_tokens: response.usage.output_tokens,
            cache_read_tokens:
              ((response.usage as unknown as Record<string, unknown>)
                .cache_read_input_tokens as number) || 0,
          },
          provider: "anthropic",
          model,
          call_id: request.call_id,
        });
      } catch (error: any) {
        if (
          error?.status &&
          RETRYABLE_STATUSES.includes(error.status) &&
          attempt < maxRetries - 1
        ) {
          this.logger.warn(
            `Direct adapter retry ${attempt + 1}: ${error.status}`,
          );
          continue;
        }
        return err(
          new LlmError(`Direct LLM call failed: ${error?.message || error}`),
        );
      }
    }

    return err(new LlmError("Direct LLM call failed after all retries"));
  }

  private tryParseTextPayload(text: string): unknown {
    if (!text) return null;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      return null;
    }
  }

  private selectModel(request: LLMRequest): string {
    if (request.model_preference === "reasoning") {
      return (
        process.env.LLM_REASONING_MODEL ||
        process.env.LLM_MODEL ||
        "claude-sonnet-4-20250514"
      );
    }
    if (request.model_preference === "balanced") {
      return (
        process.env.LLM_BALANCED_MODEL ||
        process.env.LLM_MODEL ||
        "claude-sonnet-4-20250514"
      );
    }
    return (
      process.env.LLM_FAST_MODEL ||
      process.env.LLM_MODEL ||
      "claude-haiku-4-5-20251001"
    );
  }

  private priorityToWeight(priority: LLMRequest["priority"]): number {
    switch (priority) {
      case "high":
        return 0;
      case "medium":
        return 1;
      default:
        return 2;
    }
  }

  private async acquireSlot(priority: number): Promise<void> {
    if (this.concurrency < this.maxConcurrency) {
      this.concurrency++;
      return;
    }

    return new Promise((resolve) => {
      this.queue.push({
        priority,
        resolve: () => {
          this.concurrency++;
          resolve();
        },
      });
      this.queue.sort((a, b) => a.priority - b.priority);
    });
  }

  private releaseSlot(): void {
    this.concurrency--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next?.resolve();
    }
  }
}
