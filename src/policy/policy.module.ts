import { Module, forwardRef } from '@nestjs/common';
import { PolicyService } from './policy.service';
import { PolicyController } from './policy.controller';
import { DissensusService } from './services/dissensus.service';
import { RipenessService } from './services/ripeness.service';
import { IntentNormalizerService } from './services/intent-normalizer.service';
import { BeliefsModule } from '../beliefs/beliefs.module';
import { WorldModelModule } from '../world-model/world-model.module';

@Module({
  imports: [BeliefsModule, forwardRef(() => WorldModelModule)],
  providers: [PolicyService, DissensusService, RipenessService, IntentNormalizerService],
  controllers: [PolicyController],
  exports: [PolicyService, DissensusService, RipenessService, IntentNormalizerService],
})
export class PolicyModule {}
