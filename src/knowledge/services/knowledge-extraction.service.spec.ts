import { Test, TestingModule } from '@nestjs/testing';
import { ok } from 'neverthrow';
import { KnowledgeExtractionService } from './knowledge-extraction.service';
import { KnowledgeService } from '../knowledge.service';
import { KnowledgeGapService } from './knowledge-gap.service';
import { LLM_PORT } from '../../llm/llm-port.token';
import { LlmDecisionPolicyService } from '../../llm/llm-decision-policy.service';

describe('KnowledgeExtractionService', () => {
  let service: KnowledgeExtractionService;
  const llm = {
    isAvailable: jest.fn(),
    complete: jest.fn(),
  };
  const knowledge = {
    findAll: jest.fn().mockResolvedValue(ok([])),
    findSimilar: jest.fn().mockResolvedValue(ok([])),
    create: jest.fn().mockResolvedValue(ok({})),
    reinforce: jest.fn().mockResolvedValue(ok({})),
  };
  const gaps = {
    create: jest.fn().mockResolvedValue(ok({})),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeExtractionService,
        { provide: KnowledgeService, useValue: knowledge },
        { provide: KnowledgeGapService, useValue: gaps },
        { provide: LLM_PORT, useValue: llm },
        { provide: LlmDecisionPolicyService, useValue: { buildRequest: jest.fn().mockReturnValue({}) } },
      ],
    }).compile();

    service = module.get(KnowledgeExtractionService);
  });

  it('returns empty result for trivial content', async () => {
    const result = await service.extractFromInteraction('short');
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().new_knowledge).toHaveLength(0);
  });

  it('uses LLM port and applies extracted knowledge', async () => {
    llm.isAvailable.mockReturnValue(true);
    llm.complete.mockResolvedValue(ok({
      output_text: '',
      output_data: {
        new_knowledge: [{
          content: 'Project uses PostgreSQL in production',
          kind: 'fact',
          domain: 'technical',
          confidence: 0.9,
          evidence_quality: 'explicit_statement',
          reasoning: 'explicit',
        }],
        updated_knowledge: [],
        knowledge_gaps: [],
      },
    }));

    const result = await service.extractFromInteraction('We use PostgreSQL in production and need proper migrations.');
    expect(result.isOk()).toBe(true);
    expect(llm.complete).toHaveBeenCalled();
    expect(knowledge.create).toHaveBeenCalled();
  });
});
