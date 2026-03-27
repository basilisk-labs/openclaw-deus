import { Module } from '@nestjs/common';
import { AdapterController } from './adapter.controller';
import { AdapterService } from './adapter.service';
import { WorldModelModule } from '../world-model/world-model.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [WorldModelModule, MetricsModule],
  providers: [AdapterService],
  controllers: [AdapterController],
  exports: [AdapterService],
})
export class AdapterModule {}
