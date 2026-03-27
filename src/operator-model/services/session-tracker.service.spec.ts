import { Test, TestingModule } from '@nestjs/testing';
import { SessionTrackerService } from './session-tracker.service';
import { OperatorModelService } from '../operator-model.service';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';
import { mockCognitiveConfig } from '../../__mocks__/cognitive-config.mock';
import { ok } from 'neverthrow';

describe('SessionTrackerService', () => {
  let service: SessionTrackerService;
  let operatorModel: jest.Mocked<OperatorModelService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionTrackerService,
        { provide: OperatorModelService, useValue: {
          getModel: jest.fn().mockResolvedValue(ok({ session: { frustration_signals: 0 } })),
          updateSession: jest.fn().mockResolvedValue(ok({})),
        }},
        { provide: CognitiveConfigService, useValue: mockCognitiveConfig },
      ],
    }).compile();

    service = module.get(SessionTrackerService);
    operatorModel = module.get(OperatorModelService);
  });

  describe('trackMessage', () => {
    it('should update session state on message', async () => {
      await service.trackMessage('Hello, I need help with the project');
      expect(operatorModel.updateSession).toHaveBeenCalledWith(expect.objectContaining({
        last_interaction: expect.any(String),
        interaction_count: 1,
      }));
    });

    it('should detect frustration signals in Russian', async () => {
      await service.trackMessage('Неправильно, ты не понял что я хочу');
      expect(operatorModel.updateSession).toHaveBeenCalledWith(expect.objectContaining({
        frustration_signals: 1,
      }));
    });

    it('should detect frustration signals in English', async () => {
      await service.trackMessage('Wrong again, you misunderstood');
      expect(operatorModel.updateSession).toHaveBeenCalledWith(expect.objectContaining({
        frustration_signals: 1,
      }));
    });

    it('should not flag frustration for normal messages', async () => {
      await service.trackMessage('Please add a new endpoint for user profiles');
      const calls = operatorModel.updateSession.mock.calls;
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall.frustration_signals).toBeUndefined();
    });
  });

  describe('resetSession', () => {
    it('should reset all counters', async () => {
      await service.trackMessage('test');
      await service.trackMessage('test2');
      await service.resetSession();
      expect(operatorModel.updateSession).toHaveBeenLastCalledWith(expect.objectContaining({
        frustration_signals: 0,
        interaction_count: 0,
        engagement: 'active',
      }));
    });
  });
});
