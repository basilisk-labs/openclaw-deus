import { Module, forwardRef } from '@nestjs/common';
import { NightlyService } from './nightly.service';
import { NightlyScheduler } from './nightly.scheduler';
import { BeliefsModule } from '../beliefs/beliefs.module';
import { MemoryModule } from '../memory/memory.module';
import { IntrospectionModule } from '../introspection/introspection.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { ExperienceModule } from '../experience/experience.module';
import { IntentionModule } from '../intention/intention.module';
import { WorldModelModule } from '../world-model/world-model.module';
import { MetricsModule } from '../metrics/metrics.module';
import { KernelModule } from '../kernel/kernel.module';

@Module({
  imports: [
    BeliefsModule,
    MemoryModule,
    IntrospectionModule,
    KnowledgeModule,
    ExperienceModule,
    IntentionModule,
    WorldModelModule,
    MetricsModule,
    KernelModule,
  ],
  providers: [NightlyService, NightlyScheduler],
  exports: [NightlyService],
})
export class NightlyModule {}
