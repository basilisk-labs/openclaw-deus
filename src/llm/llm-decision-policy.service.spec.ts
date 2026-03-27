import { LlmDecisionPolicyService } from './llm-decision-policy.service';
import { LlmOperationType } from './types/llm.types';

describe('LlmDecisionPolicyService', () => {
  const service = new LlmDecisionPolicyService();

  it('maps deliberation to reasoning/high request shape', () => {
    const request = service.buildRequest({
      operationType: LlmOperationType.DELIBERATION,
      reason: 'needs_planning',
      context: {},
      prompt: {
        system_prompt: 'system',
        user_message: 'user',
      },
    });

    expect(request.request_type).toBe('deliberation');
    expect(request.priority).toBe('high');
    expect(request.model_preference).toBe('reasoning');
  });

  it('downgrades model preference when energy is low', () => {
    const request = service.buildRequest({
      operationType: LlmOperationType.DELIBERATION,
      reason: 'needs_planning',
      context: {},
      prompt: {
        system_prompt: 'system',
        user_message: 'user',
      },
      energyLevel: 0.1,
    });

    expect(request.model_preference).toBe('fast');
  });
});
