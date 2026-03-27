import { Test, TestingModule } from '@nestjs/testing';
import { ok } from 'neverthrow';
import { NarrativeService } from './narrative.service';
import { SurrealService } from '../../database/surreal.service';
import { LLM_PORT } from '../../llm/llm-port.token';
import { LlmDecisionPolicyService } from '../../llm/llm-decision-policy.service';
import { CommitKernelService } from '../commit/commit-kernel.service';
import { AffectiveStateService } from '../affect/affective-state.service';

describe('NarrativeService', () => {
  let service: NarrativeService;
  const llm = {
    isAvailable: jest.fn(),
    complete: jest.fn(),
  };
  const commitKernel = {
    getAttentionWindow: jest.fn(),
    computeTimeSense: jest.fn().mockResolvedValue(ok({ dilation: 1, phase: 'active' })),
  };
  const affect = {
    getSnapshot: jest.fn().mockReturnValue({
      mode: 'stable',
      pain: { intensity: 0, source: '', chronic: false },
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NarrativeService,
        { provide: SurrealService, useValue: { query: jest.fn(), create: jest.fn().mockResolvedValue(ok({})) } },
        { provide: LLM_PORT, useValue: llm },
        { provide: LlmDecisionPolicyService, useValue: { buildRequest: jest.fn().mockReturnValue({}) } },
        { provide: CommitKernelService, useValue: commitKernel },
        { provide: AffectiveStateService, useValue: affect },
      ],
    }).compile();

    service = module.get(NarrativeService);
  });

  it('returns resting narrative when no commits are in awareness', async () => {
    commitKernel.getAttentionWindow.mockResolvedValue(ok([]));
    const result = await service.narrate();
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().summary).toContain('System resting');
  });
});
