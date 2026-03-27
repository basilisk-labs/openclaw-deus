import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { AuthGuard } from "./auth/auth.guard";
import configuration from "./common/config/configuration";
import { DatabaseModule } from "./database/database.module";
import { BootstrapModule } from "./bootstrap/bootstrap.module";
import { BeliefsModule } from "./beliefs/beliefs.module";
import { MemoryModule } from "./memory/memory.module";
import { PolicyModule } from "./policy/policy.module";
import { WorldModelModule } from "./world-model/world-model.module";
import { IntrospectionModule } from "./introspection/introspection.module";
import { NightlyModule } from "./nightly/nightly.module";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./auth/auth.module";
import { EventsModule } from "./events/events.module";
import { EmbeddingsModule } from "./embeddings/embeddings.module";
import { LlmModule } from "./llm/llm.module";
import { CognitiveModule } from "./cognitive/cognitive.module";
import { IntentionModule } from "./intention/intention.module";
import { KnowledgeModule } from "./knowledge/knowledge.module";
import { OperatorModelModule } from "./operator-model/operator-model.module";
import { DeliberationModule } from "./deliberation/deliberation.module";
import { ExperienceModule } from "./experience/experience.module";
import { MetricsModule } from "./metrics/metrics.module";
import { KernelModule } from "./kernel/kernel.module";
import { AdapterModule } from "./adapter/adapter.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    BootstrapModule,
    BeliefsModule,
    MemoryModule,
    PolicyModule,
    WorldModelModule,
    IntrospectionModule,
    NightlyModule,
    HealthModule,
    EventsModule,
    EmbeddingsModule,
    LlmModule,
    CognitiveModule,
    IntentionModule,
    KnowledgeModule,
    OperatorModelModule,
    DeliberationModule,
    ExperienceModule,
    MetricsModule,
    KernelModule,
    AdapterModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
