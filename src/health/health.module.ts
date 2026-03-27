import { Module } from '@nestjs/common';
import { HealthService } from './health.service';
import { HealthController } from './health.controller';
import { BeliefsModule } from '../beliefs/beliefs.module';
import { MemoryModule } from '../memory/memory.module';

@Module({
  imports: [BeliefsModule, MemoryModule],
  providers: [HealthService],
  controllers: [HealthController],
  exports: [HealthService],
})
export class HealthModule {}
