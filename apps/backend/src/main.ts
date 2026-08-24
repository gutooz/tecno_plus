import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

/**
 * Entrypoint HTTP (API). O pipeline de IA roda neste mesmo processo, em segundo
 * plano (agendado via setImmediate no QueueService) — a resposta HTTP volta na
 * hora, sem bloquear a interface esperando a IA, e sem depender de Redis/worker.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.use(helmet());
  app.enableCors({ origin: config.get<string[]>('security.corsOrigin'), credentials: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('zycron API')
    .setDescription('API do MVP de cadastro inteligente de produtos com IA')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = config.get<number>('port') ?? 3333;
  await app.listen(port);
  logger.log(`API em http://localhost:${port}/api  |  Swagger em /api/docs`);
}

bootstrap();
