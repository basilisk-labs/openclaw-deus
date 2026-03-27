import { Module } from "@nestjs/common";
import { BeliefsModule } from "../beliefs/beliefs.module";
import { IntrospectionModule } from "../introspection/introspection.module";
import { WorldModelModule } from "../world-model/world-model.module";
import { DiagnosisService } from "./diagnosis.service";
import { MetricsService } from "./metrics.service";

@Module({
  imports: [
    IntrospectionModule,
    BeliefsModule,
    WorldModelModule,
  ],
  providers: [
    MetricsService,
    DiagnosisService,
  ],
  exports: [
    MetricsService,
    DiagnosisService,
  ],
})
export class SidecarMetricsModule {}
