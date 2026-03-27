import { Module } from "@nestjs/common";
import { AdapterController } from "./adapter.controller";
import { AdapterService } from "./adapter.service";
import { WorldModelModule } from "../world-model/world-model.module";
import { SidecarMetricsModule } from "../metrics/sidecar-metrics.module";

@Module({
  imports: [WorldModelModule, SidecarMetricsModule],
  providers: [AdapterService],
  controllers: [AdapterController],
  exports: [AdapterService],
})
export class AdapterModule {}
