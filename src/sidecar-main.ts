import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { json, urlencoded } from "express";
import helmet from "helmet";
import { BootstrapService } from "./bootstrap/bootstrap.service";
import { SidecarAppModule } from "./sidecar-app.module";

const SIDECAR_BODY_LIMIT = process.env.SIDECAR_BODY_LIMIT || "2mb";
const SIDECAR_REQUIRED_TABLES = [
  "belief",
  "activity_log",
  "daily_memory",
  "review_candidate",
  "world_model",
  "introspection_report",
  "nightly_run",
  "contradicts",
  "cognitive_config",
  "prediction",
  "llm_token_usage",
  "knowledge",
  "knowledge_gap",
  "intention",
  "deliberation",
  "episode",
  "operator_model",
  "cognitive_snapshot",
  "diagnosis",
  "adapter_import_cursor",
  "adapter_log_entry",
  "adapter_snapshot",
];

async function bootstrap() {
  const logger = new Logger("SidecarBootstrap");
  const app = await NestFactory.create(SidecarAppModule, {
    bodyParser: false,
  });

  app.use(json({ limit: SIDECAR_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: SIDECAR_BODY_LIMIT }));

  app.use(helmet());
  app.enableCors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("DEUS Cognitive Runtime Sidecar")
    .setDescription("Adapter-facing API for the cognitive runtime")
    .setVersion("2.0")
    .addBearerAuth()
    .addTag("adapter", "Master-side import and bounded read-model endpoints")
    .addTag("health", "Health and readiness surfaces")
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  app.enableShutdownHooks();
  await app.init();

  const bootstrapService = app.get(BootstrapService);
  const migrationResult = await bootstrapService.runMigrations();
  if (migrationResult.isErr()) {
    throw migrationResult.error;
  }

  const schemaResult = await bootstrapService.ensureTablesExist(
    SIDECAR_REQUIRED_TABLES,
  );
  if (schemaResult.isErr()) {
    throw schemaResult.error;
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(
    `DEUS sidecar on :${port} | bodyLimit=${SIDECAR_BODY_LIMIT} | Swagger: http://127.0.0.1:${port}/api/docs`,
  );
}

bootstrap();
