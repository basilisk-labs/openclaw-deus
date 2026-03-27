import { ok } from 'neverthrow';
import { ModuleRef } from '@nestjs/core';
import { LlmClientService } from './llm-client.service';
import { LlmDecisionPolicyService } from './llm-decision-policy.service';
import { LlmBudgetExhaustedError } from './llm.errors';

describe('LlmClientService', () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  function makeService(overrides?: {
    mode?: 'direct' | 'openclaw';
    directResult?: any;
    gatewayResult?: any;
    canAfford?: boolean;
  }) {
    process.env.LLM_MODE = overrides?.mode || 'direct';
    process.env.LLM_FALLBACK_TO_DIRECT = 'true';

    const directAdapter = {
      isAvailable: jest.fn().mockReturnValue(true),
      complete: jest.fn().mockResolvedValue(overrides?.directResult || ok({
        output_text: 'direct',
        output_data: { value: 1 },
        usage: { prompt_tokens: 10, completion_tokens: 5 },
        provider: 'anthropic',
        model: 'haiku',
      })),
    };
    const gatewayAdapter = {
      isAvailable: jest.fn().mockReturnValue(true),
      complete: jest.fn().mockResolvedValue(overrides?.gatewayResult || ok({
        output_text: 'gateway',
        output_data: { value: 2 },
        usage: { prompt_tokens: 8, completion_tokens: 4 },
        provider: 'openclaw',
        model: 'balanced',
      })),
    };
    const budget = {
      loadToday: jest.fn().mockResolvedValue(undefined),
      canAfford: jest.fn().mockReturnValue(overrides?.canAfford ?? true),
      record: jest.fn().mockResolvedValue(undefined),
    };
    const cache = {
      get: jest.fn().mockReturnValue(null),
      set: jest.fn(),
    };
    const decision = new LlmDecisionPolicyService();
    const observability = {
      record: jest.fn().mockResolvedValue(undefined),
    };
    const moduleRef = { get: jest.fn().mockReturnValue(null) } as unknown as ModuleRef;

    return {
      service: new LlmClientService(
        directAdapter as any,
        gatewayAdapter as any,
        budget as any,
        cache as any,
        decision,
        observability as any,
        moduleRef,
      ),
      directAdapter,
      gatewayAdapter,
      budget,
      observability,
    };
  }

  it('uses direct adapter in direct mode', async () => {
    const { service, directAdapter, gatewayAdapter } = makeService({ mode: 'direct' });
    const result = await service.complete({
      request_type: 'narrative',
      reason: 'test',
      priority: 'low',
      budget_class: 'cheap',
      context: {},
      prompt: { system_prompt: 'system', user_message: 'user' },
      metadata: { operation_type: 'self_assessment' },
    });

    expect(result.isOk()).toBe(true);
    expect(directAdapter.complete).toHaveBeenCalled();
    expect(gatewayAdapter.complete).not.toHaveBeenCalled();
  });

  it('falls back to direct adapter when gateway mode fails', async () => {
    const { service, directAdapter, gatewayAdapter } = makeService({
      mode: 'openclaw',
      gatewayResult: { isErr: () => true, error: { code: 'LLM_ERROR', message: 'gateway failed' } },
    } as any);
    gatewayAdapter.complete.mockResolvedValue({ isErr: () => true, error: { code: 'LLM_ERROR', message: 'gateway failed' } });

    const result = await service.complete({
      request_type: 'narrative',
      reason: 'test',
      priority: 'low',
      budget_class: 'cheap',
      context: {},
      prompt: { system_prompt: 'system', user_message: 'user' },
      metadata: { operation_type: 'self_assessment' },
    });

    expect(result.isOk()).toBe(true);
    expect(gatewayAdapter.complete).toHaveBeenCalled();
    expect(directAdapter.complete).toHaveBeenCalled();
  });

  it('returns budget error when request cannot be afforded', async () => {
    const { service } = makeService({ canAfford: false });
    const result = await service.complete({
      request_type: 'narrative',
      reason: 'test',
      priority: 'low',
      budget_class: 'cheap',
      context: {},
      prompt: { system_prompt: 'system', user_message: 'user' },
      metadata: { operation_type: 'self_assessment' },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(LlmBudgetExhaustedError);
  });
});
