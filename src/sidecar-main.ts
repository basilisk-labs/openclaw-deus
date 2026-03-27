import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { SidecarAppModule } from './sidecar-app.module';

async function bootstrap() {
  const logger = new Logger('SidecarBootstrap');
  const app = await NestFactory.create(SidecarAppModule);

  app.use(helmet());
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('DEUS Cognitive Runtime Sidecar')
    .setDescription('Adapter-facing API for the cognitive runtime')
    .setVersion('2.0')
    .addBearerAuth()
    .addTag('adapter', 'Master-side import and bounded read-model endpoints')
    .addTag('health', 'Health and readiness surfaces')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`DEUS sidecar on :${port} | Swagger: http://127.0.0.1:${port}/api/docs`);
}

bootstrap();
