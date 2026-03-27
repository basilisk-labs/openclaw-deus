import { Module } from '@nestjs/common';
import { WorldModelService } from './world-model.service';
import { WorldModelController } from './world-model.controller';
import { BeliefsModule } from '../beliefs/beliefs.module';
import { MemoryModule } from '../memory/memory.module';
import { IntentionModule } from '../intention/intention.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { OperatorModelModule } from '../operator-model/operator-model.module';
import { ExperienceModule } from '../experience/experience.module';

@Module({
  imports: [BeliefsModule, MemoryModule, IntentionModule, KnowledgeModule, OperatorModelModule, ExperienceModule],
  providers: [WorldModelService],
  controllers: [WorldModelController],
  exports: [WorldModelService],
})
export class WorldModelModule {}
