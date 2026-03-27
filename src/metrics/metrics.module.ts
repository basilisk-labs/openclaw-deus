import { Module, forwardRef } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { DiagnosisService } from './diagnosis.service';
import { BenchmarkService } from './benchmark.service';
import { ExperimentService } from './experiment.service';
import { RecursiveImproveService } from './recursive-improve.service';
import { MetricsController } from './metrics.controller';
import { IntrospectionModule } from '../introspection/introspection.module';
import { BeliefsModule } from '../beliefs/beliefs.module';
import { WorldModelModule } from '../world-model/world-model.module';

@Module({
  imports: [
    IntrospectionModule,
    BeliefsModule,
    WorldModelModule,
  ],
  controllers: [MetricsController],
  providers: [
    MetricsService,
    DiagnosisService,
    BenchmarkService,
    ExperimentService,
    RecursiveImproveService,
  ],
  exports: [
    MetricsService,
    DiagnosisService,
    BenchmarkService,
    ExperimentService,
    RecursiveImproveService,
  ],
})
export class MetricsModule {}
