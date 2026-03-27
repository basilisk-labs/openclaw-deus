import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { Result, ok, err, DomainError } from '../common/types/result.types';
import { EnergyService } from '../kernel/energy.service';
import { LlmBudgetService } from './llm-budget.service';
import { LlmCacheService } from './llm-cache.service';
import { LlmDecisionPolicyService } from './llm-decision-policy.service';
import { LlmCallOptions, LlmCallResult, LlmOperationType, LlmPriority } from './types/llm.types';
import { DIRECT_LLM_ADAPTER, OPENCLOW_GATEWAY_ADAPTER } from './llm-port.token';
import { LlmBudgetExhaustedError, LlmError } from './llm.errors';
import { LlmObservabilityService } from './llm-observability.service';
import { LLMPort, LLMRequest, LLMResponse } from './types/llm-port.types';

@Injectable()
export class LlmClientService implements LLMPort, OnModuleInit {
  private readonly logger = new Logger(LlmClientService.name);
  private paused = false;
  private energyService?: EnergyService | null;

  constructor(
    @Inject(DIRECT_LLM_ADAPTER) private readonly directAdapter: LLMPort,
    @Inject(OPENCLOW_GATEWAY_ADAPTER) private readonly openclawAdapter: LLMPort,
    private readonly budget: LlmBudgetService,
    private readonly cache: LlmCacheService,
    private readonly decisions: LlmDecisionPolicyService,
    private readonly observability: LlmObservabilityService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.budget.loadToday();
  }

  isAvailable(): boolean {
    return !this.paused && this.primaryAdapter().isAvailable();
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  async complete(request: LLMRequest): Promise<Result<LLMResponse, DomainError>> {
    const callId = request.call_id || randomUUID();
    const normalizedRequest = { ...request, call_id: callId };

    if (this.paused) {
      const error = new LlmError('LLM paused (training mode)');
      await this.recordFailure(normalizedRequest, error, this.mode(), false);
      return err(error);
    }

    const cached = this.readCache(normalizedRequest);
    if (cached) {
      await this.observability.record({
        call_id: callId,
        trace_id: normalizedRequest.trace_id,
        request_type: normalizedRequest.request_type,
        reason: normalizedRequest.reason,
        priority: normalizedRequest.priority,
        budget_class: normalizedRequest.budget_class,
        provider: cached.provider,
        model: cached.model,
        latency_ms: 0,
        token_usage: cached.usage,
        mode: this.mode(),
        cached: true,
        success: true,
      });
      return ok(cached);
    }

    const gated = this.applyExecutionGuards(normalizedRequest);
    if (gated.isErr()) {
      await this.recordFailure(normalizedRequest, gated.error, this.mode(), false);
      return err(gated.error);
    }

    const effectiveRequest = gated.value;
    let mode = this.mode();
    let result = await this.primaryAdapter().complete(effectiveRequest);
    let fallbackUsed = false;

    if (result.isErr() && this.shouldFallbackToDirect()) {
      this.logger.warn(`Gateway mode failed, falling back to direct adapter: ${result.error.message}`);
      mode = 'direct';
      fallbackUsed = true;
      result = await this.directAdapter.complete(effectiveRequest);
    }

    if (result.isErr()) {
      await this.recordFailure(effectiveRequest, result.error, mode, fallbackUsed);
      return err(result.error);
    }

    await this.recordUsage(result.value, effectiveRequest);
    this.writeCache(effectiveRequest, result.value);
    await this.observability.record({
      call_id: callId,
      trace_id: effectiveRequest.trace_id,
      request_type: effectiveRequest.request_type,
      reason: effectiveRequest.reason,
      priority: effectiveRequest.priority,
      budget_class: effectiveRequest.budget_class,
      provider: result.value.provider,
      model: result.value.model,
      latency_ms: result.value.latency_ms,
      token_usage: result.value.usage,
      mode,
      cached: result.value.cached,
      success: true,
      fallback_used: fallbackUsed,
    });

    return ok(result.value);
  }

  async call<T = unknown>(options: LlmCallOptions): Promise<Result<LlmCallResult<T>, DomainError>> {
    const request = this.decisions.buildRequest({
      operationType: options.operationType,
      reason: 'legacy_call',
      priorityOverride: this.decisions.mapLegacyPriority(options.priority),
      context: {
        input: options.userMessage,
      },
      prompt: {
        system_prompt: options.systemPrompt,
        user_message: options.userMessage,
        tools: options.tools,
        force_tool: options.forceTool,
      },
      maxTokens: options.maxTokens,
      cacheKey: options.cacheKey,
      cacheTtlMs: options.cacheTtlMs,
    });

    const result = await this.complete(request);
    if (result.isErr()) {
      return err(result.error);
    }

    return ok({
      data: (result.value.output_data ?? this.parseOutput(result.value.output_text)) as T,
      usage: {
        input_tokens: result.value.usage?.prompt_tokens || 0,
        output_tokens: result.value.usage?.completion_tokens || 0,
        cache_read_tokens: result.value.usage?.cache_read_tokens || 0,
      },
      latencyMs: result.value.latency_ms || 0,
      cached: result.value.cached || false,
      operationType: options.operationType,
    });
  }

  private applyExecutionGuards(request: LLMRequest): Result<LLMRequest, DomainError> {
    const estimatedInput = (request.prompt.system_prompt.length + request.prompt.user_message.length) / 4;
    const estimatedOutput = request.max_tokens || 1024;
    const budgetBypassed = request.priority === 'high' && request.budget_class === 'expensive_allowed';

    if (!budgetBypassed && !this.budget.canAfford(
      estimatedInput,
      estimatedOutput,
      this.toLegacyPriority(request.priority),
    )) {
      return err(new LlmBudgetExhaustedError('Daily LLM token budget exhausted'));
    }

    const energy = this.getEnergyService();
    if (!energy) {
      return ok(request);
    }

    const currentEnergy = energy.getState().current;
    if (!energy.canAffordLlm() && request.priority !== 'high') {
      return err(new LlmError('LLM skipped: insufficient cognitive energy'));
    }

    if (currentEnergy < 0.2 && request.model_preference === 'reasoning') {
      return ok({ ...request, model_preference: 'fast' });
    }

    if (currentEnergy < 0.35 && request.model_preference === 'balanced') {
      return ok({ ...request, model_preference: 'fast' });
    }

    return ok(request);
  }

  private readCache(request: LLMRequest): LLMResponse | null {
    if (!request.cache?.key) {
      return null;
    }

    return this.cache.get<LLMResponse>(request.cache.key);
  }

  private writeCache(request: LLMRequest, response: LLMResponse): void {
    const operationType = request.metadata?.operation_type;
    if (!request.cache?.key || typeof operationType !== 'string') {
      return;
    }

    this.cache.set(
      request.cache.key,
      { ...response, cached: true },
      operationType as LlmOperationType,
    );
  }

  private async recordUsage(response: LLMResponse, request: LLMRequest): Promise<void> {
    const operationType = request.metadata?.operation_type;
    if (typeof operationType !== 'string' || !response.usage) {
      return;
    }

    await this.budget.record(
      response.usage.prompt_tokens,
      response.usage.completion_tokens,
      response.usage.cache_read_tokens || 0,
      operationType as LlmOperationType,
    );
  }

  private async recordFailure(
    request: LLMRequest,
    error: DomainError,
    mode: 'direct' | 'openclaw',
    fallbackUsed: boolean,
  ): Promise<void> {
    await this.observability.record({
      call_id: request.call_id || randomUUID(),
      trace_id: request.trace_id,
      request_type: request.request_type,
      reason: request.reason,
      priority: request.priority,
      budget_class: request.budget_class,
      mode,
      success: false,
      fallback_used: fallbackUsed,
      error_code: error.code,
      error_message: error.message,
    });
  }

  private primaryAdapter(): LLMPort {
    return this.mode() === 'openclaw' ? this.openclawAdapter : this.directAdapter;
  }

  private shouldFallbackToDirect(): boolean {
    return this.mode() === 'openclaw'
      && (process.env.LLM_FALLBACK_TO_DIRECT || 'true') !== 'false'
      && this.directAdapter.isAvailable();
  }

  private mode(): 'direct' | 'openclaw' {
    return process.env.LLM_MODE === 'openclaw' ? 'openclaw' : 'direct';
  }

  private toLegacyPriority(priority: LLMRequest['priority']): LlmPriority {
    switch (priority) {
      case 'high':
        return LlmPriority.CRITICAL;
      case 'medium':
        return LlmPriority.NORMAL;
      case 'low':
      default:
        return LlmPriority.LOW;
    }
  }

  private getEnergyService(): EnergyService | null {
    if (this.energyService !== undefined) {
      return this.energyService;
    }

    try {
      this.energyService = this.moduleRef.get(EnergyService, { strict: false });
    } catch {
      this.energyService = null;
    }

    return this.energyService;
  }

  private parseOutput(text: string): unknown {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      return {};
    }
  }
}

export { LlmError, LlmBudgetExhaustedError } from './llm.errors';
