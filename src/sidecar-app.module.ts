import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './common/config/configuration';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { LlmModule } from './llm/llm.module';
import { SidecarCognitiveFoundationModule } from './sidecar-cognitive-foundation.module';
import { MemoryModule } from './memory/memory.module';
import { BeliefsModule } from './beliefs/beliefs.module';
import { IntentionModule } from './intention/intention.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { OperatorModelModule } from './operator-model/operator-model.module';
import { DeliberationModule } from './deliberation/deliberation.module';
import { ExperienceModule } from './experience/experience.module';
import { PolicyModule } from './policy/policy.module';
import { WorldModelModule } from './world-model/world-model.module';
import { IntrospectionModule } from './introspection/introspection.module';
import { MetricsModule } from './metrics/metrics.module';
import { HealthModule } from './health/health.module';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { AdapterModule } from './adapter/adapter.module';

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
    DatabaseModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'deus-dev-secret-change-in-production',
      signOptions: { expiresIn: '24h' },
    }),
    AuthModule,
    EmbeddingsModule,
    LlmModule,
    SidecarCognitiveFoundationModule,
    MemoryModule,
    BeliefsModule,
    IntentionModule,
    KnowledgeModule,
    OperatorModelModule,
    DeliberationModule,
    ExperienceModule,
    PolicyModule,
    WorldModelModule,
    IntrospectionModule,
    MetricsModule,
    HealthModule,
    BootstrapModule,
    AdapterModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class SidecarAppModule {}
