import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

/**
 * Entrypoint HTTP (API). NÃO processa jobs — apenas enfileira. O processamento
 * pesado roda no worker.ts. Isso garante que a interface nunca fique bloqueada
 * aguardando IA.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.use(helmet());
  app.enableCors({ origin: config.get<string>('security.corsOrigin'), credentials: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Tecno Plus AI Catalog API')
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
