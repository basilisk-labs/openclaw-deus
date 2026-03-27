import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Security
  app.use(helmet());
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });

  // Validation
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('DEUS Cognitive Runtime')
    .setDescription('API for beliefs, memory, policy, introspection, and world-model')
    .setVersion('2.0')
    .addBearerAuth()
    .addTag('beliefs', 'Belief CRUD, extraction, decay, contradictions, promotion')
    .addTag('memory', 'Activity logging, aggregation, search')
    .addTag('policy', 'Action evaluation and dissensus')
    .addTag('world-model', 'World model snapshots')
    .addTag('introspection', 'Introspection pipeline')
    .addTag('health', 'System health')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // Graceful shutdown
  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`DEUS runtime on :${port} | Swagger: http://localhost:${port}/api/docs`);
}

bootstrap();
