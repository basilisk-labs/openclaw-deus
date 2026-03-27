import { Module } from '@nestjs/common';
import { DeliberationService } from './deliberation.service';
import { BeliefsModule } from '../beliefs/beliefs.module';
import { PolicyModule } from '../policy/policy.module';
import { ExperienceModule } from '../experience/experience.module';

@Module({
  imports: [BeliefsModule, PolicyModule, ExperienceModule],
  providers: [DeliberationService],
  exports: [DeliberationService],
})
export class DeliberationModule {}
