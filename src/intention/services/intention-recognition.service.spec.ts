import { Test, TestingModule } from '@nestjs/testing';
import { IntentionRecognitionService } from './intention-recognition.service';
import { IntentionService } from '../intention.service';
import { LlmClientService } from '../../llm/llm-client.service';
import { SimilarityProvider } from '../../cognitive/similarity.provider';
import { ok } from 'neverthrow';

describe('IntentionRecognitionService', () => {
  let service: IntentionRecognitionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntentionRecognitionService,
        { provide: IntentionService, useValue: {
          findActive: jest.fn().mockResolvedValue(ok([])),
          create: jest.fn().mockResolvedValue(ok({})),
          transition: jest.fn().mockResolvedValue(ok({})),
          updateProgress: jest.fn().mockResolvedValue(ok({})),
        }},
        { provide: LlmClientService, useValue: { isAvailable: jest.fn().mockReturnValue(false) }},
        { provide: SimilarityProvider, useValue: { findBestWordMatch: jest.fn().mockReturnValue(null), wordOverlap: jest.fn().mockReturnValue(0) } },
      ],
    }).compile();

    service = module.get(IntentionRecognitionService);
  });

  describe('recognizeFromMessage (fallback mode)', () => {
    it('should skip trivial messages', async () => {
      const result = await service.recognizeFromMessage('ok');
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().new_intentions).toHaveLength(0);
    });

    it('should detect explicit task requests in English', async () => {
      const result = await service.recognizeFromMessage('Can you fix the authentication bug in the login page?');
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().new_intentions.length).toBeGreaterThan(0);
      expect(result._unsafeUnwrap().new_intentions[0].kind).toBe('task');
    });

    it('should detect explicit task requests in Russian', async () => {
      const result = await service.recognizeFromMessage('Давай напиши тесты для модуля авторизации');
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().new_intentions.length).toBeGreaterThan(0);
    });

    it('should detect completion signals', async () => {
      // With active intentions
      const intentionService = (service as any).intentions;
      intentionService.findActive.mockResolvedValue(ok([
        { intention_id: 'INT001', status: 'active', description: 'Fix bug' },
      ]));

      const result = await service.recognizeFromMessage('Done, the fix is ready');
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().completed_intentions.length).toBeGreaterThan(0);
    });
  });
});
