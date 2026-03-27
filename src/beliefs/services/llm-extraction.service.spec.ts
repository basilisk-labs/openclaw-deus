import { ok } from 'neverthrow';
import { LlmExtractionService } from './llm-extraction.service';

describe('LlmExtractionService', () => {
  it('returns error when LLM port is unavailable', async () => {
    const service = new LlmExtractionService(
      { isAvailable: () => false, complete: jest.fn() } as any,
      { buildRequest: jest.fn() } as any,
    );

    const result = await service.extractCandidates('content', 'memory');
    expect(result.isErr()).toBe(true);
  });

  it('parses JSON array from output_text', async () => {
    const service = new LlmExtractionService(
      {
        isAvailable: () => true,
        complete: jest.fn().mockResolvedValue(ok({
          output_text: '[{\"content\":\"User prefers short summaries\",\"confidence\":0.9,\"category\":\"communication\",\"autoPromote\":true}]',
        })),
      } as any,
      { buildRequest: jest.fn().mockReturnValue({}) } as any,
    );

    const result = await service.extractCandidates('content', 'memory');
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toHaveLength(1);
  });
});
