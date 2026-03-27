import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { LlmCallOptions, LlmCallResult, LlmOperationType, LlmPriority } from './types/llm.types';
import { LlmBudgetService } from './llm-budget.service';
import { LlmCacheService } from './llm-cache.service';
import Anthropic from '@anthropic-ai/sdk';

export class LlmError extends DomainError {
  readonly code = 'LLM_ERROR';
}

export class LlmBudgetExhaustedError extends DomainError {
  readonly code = 'LLM_BUDGET_EXHAUSTED';
}

const RETRY_DELAYS = [0, 1000, 4000, 16000];
const RETRYABLE_STATUSES = [429, 500, 529];

@Injectable()
export class LlmClientService {
  private readonly logger = new Logger(LlmClientService.name);
  private client: Anthropic | null = null;
  private concurrency = 0;
  private maxConcurrency: number;
  private queue: Array<{ resolve: () => void; priority: LlmPriority }> = [];
  private paused = false;

  constructor(
    private readonly budget: LlmBudgetService,
    private readonly cache: LlmCacheService,
  ) {
    const apiKey = process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY;
    this.maxConcurrency = parseInt(process.env.LLM_MAX_CONCURRENCY || '2', 10);
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
  }

  isAvailable(): boolean {
    return this.client !== null && !this.paused;
  }

  /** Pause LLM calls (training mode — no tokens spent). */
  pause(): void { this.paused = true; }

  /** Resume LLM calls (production mode). */
  resume(): void { this.paused = false; }

  async call<T = unknown>(options: LlmCallOptions): Promise<Result<LlmCallResult<T>, DomainError>> {
    // Check cache
    if (options.cacheKey) {
      const cached = this.cache.get<T>(options.cacheKey);
      if (cached !== null) {
        return ok({
          data: cached,
          usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 },
          latencyMs: 0,
          cached: true,
          operationType: options.operationType,
        });
      }
    }

    // Check availability
    if (!this.client || this.paused) {
      return err(new LlmError(this.paused ? 'LLM paused (training mode)' : 'LLM client not available — API key not configured'));
    }

    // Check budget
    const estimatedInput = options.systemPrompt.length / 4 + options.userMessage.length / 4;
    const estimatedOutput = options.maxTokens;
    if (!this.budget.canAfford(estimatedInput, estimatedOutput, options.priority)) {
      return err(new LlmBudgetExhaustedError('Daily LLM token budget exhausted'));
    }

    // Concurrency control
    await this.acquireSlot(options.priority);

    try {
      const start = Date.now();
      const result = await this.callWithRetry(options);
      const latencyMs = Date.now() - start;

      if (result.isErr()) return err(result.error);

      const { data, usage } = result.value;

      // Record budget
      await this.budget.record(
        usage.input_tokens,
        usage.output_tokens,
        usage.cache_read_tokens || 0,
        options.operationType,
      );

      // Cache result
      if (options.cacheKey) {
        this.cache.set(options.cacheKey, data, options.operationType);
      }

      this.logger.log(
        `LLM ${options.operationType}: ${usage.input_tokens}in/${usage.output_tokens}out, ${latencyMs}ms`,
      );

      return ok({
        data: data as T,
        usage,
        latencyMs,
        cached: false,
        operationType: options.operationType,
      });
    } finally {
      this.releaseSlot();
    }
  }

  private async callWithRetry(
    options: LlmCallOptions,
  ): Promise<Result<{ data: unknown; usage: { input_tokens: number; output_tokens: number; cache_read_tokens: number } }, DomainError>> {
    const maxRetries = options.priority === LlmPriority.CRITICAL ? 4 : 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt] || 16000));
      }

      try {
        const tools = options.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema as Anthropic.Tool.InputSchema,
        }));

        const response = await this.client!.messages.create({
          model: process.env.LLM_MODEL || 'claude-haiku-4-5-20251001',
          max_tokens: options.maxTokens,
          system: [{
            type: 'text' as const,
            text: options.systemPrompt,
            cache_control: { type: 'ephemeral' as const },
          }],
          messages: [{ role: 'user', content: options.userMessage }],
          tools,
          tool_choice: options.forceTool
            ? { type: 'tool' as const, name: options.forceTool }
            : { type: 'auto' as const },
        });

        // Extract tool_use result
        const toolUse = response.content.find((c) => c.type === 'tool_use');
        const data = toolUse && 'input' in toolUse ? toolUse.input : null;

        if (!data) {
          // Fallback: try to extract from text
          const textBlock = response.content.find((c) => c.type === 'text');
          const text = textBlock && 'text' in textBlock ? textBlock.text : '';
          try {
            const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
            return ok({
              data: jsonMatch ? JSON.parse(jsonMatch[0]) : {},
              usage: {
                input_tokens: response.usage.input_tokens,
                output_tokens: response.usage.output_tokens,
                cache_read_tokens: (response.usage as unknown as Record<string, unknown>).cache_read_input_tokens as number || 0, // Anthropic extended usage field
              },
            });
          } catch {
            return err(new LlmError('No structured output from LLM'));
          }
        }

        return ok({
          data,
          usage: {
            input_tokens: response.usage.input_tokens,
            output_tokens: response.usage.output_tokens,
            cache_read_tokens: (response.usage as unknown as Record<string, unknown>).cache_read_input_tokens as number || 0, // Anthropic extended usage field
          },
        });
      } catch (error: any) {
        if (error?.status && RETRYABLE_STATUSES.includes(error.status) && attempt < maxRetries - 1) {
          this.logger.warn(`LLM retry ${attempt + 1}: ${error.status}`);
          continue;
        }
        return err(new LlmError(`LLM call failed: ${error?.message || error}`));
      }
    }

    return err(new LlmError('LLM call failed after all retries'));
  }

  private async acquireSlot(priority: LlmPriority): Promise<void> {
    if (this.concurrency < this.maxConcurrency) {
      this.concurrency++;
      return;
    }
    // Wait for a slot
    return new Promise((resolve) => {
      this.queue.push({ resolve: () => { this.concurrency++; resolve(); }, priority });
      this.queue.sort((a, b) => a.priority - b.priority);
    });
  }

  private releaseSlot(): void {
    this.concurrency--;
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next.resolve();
    }
  }
}
