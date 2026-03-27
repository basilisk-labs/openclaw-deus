import { ok } from 'neverthrow';
import { OpenClawGatewayAdapter } from './openclaw-gateway.adapter';
import { LLMRequest } from './types/llm-port.types';

describe('OpenClawGatewayAdapter', () => {
  const originalFetch = global.fetch;
  const env = { ...process.env };

  beforeEach(() => {
    process.env.OPENCLAW_GATEWAY_URL = 'http://127.0.0.1:9999';
    process.env.OPENCLAW_API_KEY = 'test-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...env };
  });

  it('sends structured request to gateway and maps response', async () => {
    const adapter = new OpenClawGatewayAdapter();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: 'done',
        provider: 'openclaw',
        model: 'balanced',
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    }) as any;

    const request: LLMRequest = {
      call_id: 'call-1',
      request_type: 'knowledge_extraction',
      reason: 'operator_query',
      priority: 'medium',
      budget_class: 'standard',
      context: { input: 'text' },
      prompt: { system_prompt: 'system', user_message: 'user' },
    };

    const result = await adapter.complete(request);
    expect(result.isOk()).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:9999/inference/complete',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });
});
