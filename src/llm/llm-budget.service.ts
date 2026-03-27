import { Injectable, Logger } from '@nestjs/common';
import { SurrealService } from '../database/surreal.service';
import { TokenUsage, DEFAULT_TOKEN_BUDGET, LlmOperationType, LlmPriority } from './types/llm.types';

@Injectable()
export class LlmBudgetService {
  private readonly logger = new Logger(LlmBudgetService.name);
  private todayUsage: TokenUsage;
  private callsSinceFlush = 0;

  constructor(private readonly db: SurrealService) {
    this.todayUsage = this.emptyUsage();
  }

  async loadToday(): Promise<void> {
    const dayKey = new Date().toISOString().slice(0, 10);
    const result = await this.db.query<TokenUsage>(
      'SELECT * FROM llm_token_usage WHERE day_key = $day LIMIT 1',
      { day: dayKey },
    );
    if (result.isOk() && result.value.length > 0) {
      this.todayUsage = result.value[0];
    } else {
      this.todayUsage = { ...this.emptyUsage(), day_key: dayKey };
    }
  }

  canAfford(estimatedInput: number, estimatedOutput: number, priority: LlmPriority): boolean {
    // Critical priority bypasses daily limits (but not monthly)
    if (priority === LlmPriority.CRITICAL) return true;

    const budget = DEFAULT_TOKEN_BUDGET;
    return (
      this.todayUsage.input_tokens + estimatedInput <= budget.daily_input_limit &&
      this.todayUsage.output_tokens + estimatedOutput <= budget.daily_output_limit
    );
  }

  async record(input: number, output: number, cacheRead: number, operation: LlmOperationType): Promise<void> {
    this.todayUsage.input_tokens += input;
    this.todayUsage.output_tokens += output;
    this.todayUsage.cache_read_tokens += cacheRead;
    this.todayUsage.call_count += 1;

    const opKey = operation;
    if (!this.todayUsage.by_operation[opKey]) {
      this.todayUsage.by_operation[opKey] = { input: 0, output: 0, calls: 0 };
    }
    this.todayUsage.by_operation[opKey].input += input;
    this.todayUsage.by_operation[opKey].output += output;
    this.todayUsage.by_operation[opKey].calls += 1;

    this.callsSinceFlush++;
    if (this.callsSinceFlush >= 5) {
      await this.flush();
    }

    // Budget warning at 80%
    const budget = DEFAULT_TOKEN_BUDGET;
    if (this.todayUsage.input_tokens > budget.daily_input_limit * 0.8) {
      this.logger.warn(`LLM budget warning: ${this.todayUsage.input_tokens}/${budget.daily_input_limit} input tokens used today`);
    }
  }

  async flush(): Promise<void> {
    const dayKey = this.todayUsage.day_key || new Date().toISOString().slice(0, 10);
    await this.db.execute(
      `UPSERT llm_token_usage SET
        day_key = $day,
        input_tokens = $input,
        output_tokens = $output,
        cache_read_tokens = $cache,
        call_count = $calls,
        by_operation = $ops
      WHERE day_key = $day`,
      {
        day: dayKey,
        input: this.todayUsage.input_tokens,
        output: this.todayUsage.output_tokens,
        cache: this.todayUsage.cache_read_tokens,
        calls: this.todayUsage.call_count,
        ops: this.todayUsage.by_operation,
      },
    );
    this.callsSinceFlush = 0;
  }

  getUsage(): TokenUsage {
    return { ...this.todayUsage };
  }

  private emptyUsage(): TokenUsage {
    return {
      day_key: new Date().toISOString().slice(0, 10),
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      call_count: 0,
      by_operation: {},
    };
  }
}
