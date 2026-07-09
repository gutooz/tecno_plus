import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { PipelineJobData, QueueName } from '@tecnoplus/shared';
import { AppModule } from './app.module';
import { PipelineOrchestrator } from './modules/queues/pipeline.orchestrator';
import { buildRedisOptions } from './modules/queues/redis.connection';

/**
 * Processo WORKER (background). Reaproveita o AppModule (sem servidor HTTP) para
 * ter acesso aos agentes/orquestrador e cria um Worker BullMQ por fila do
 * pipeline. Retentativas/backoff são do BullMQ; após esgotar, o job cai na
 * dead-letter.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: false });
  const logger = new Logger('Worker');
  const config = app.get(ConfigService);
  const orchestrator = app.get(PipelineOrchestrator);
  const connection = buildRedisOptions(config);

  const handlers: Record<string, (data: PipelineJobData) => Promise<void>> = {
    [QueueName.VISION]: (d) => orchestrator.handleVision(d),
    [QueueName.MARKET]: (d) => orchestrator.handleMarket(d),
    [QueueName.CONTENT]: (d) => orchestrator.handleContent(d),
    [QueueName.IMAGE]: (d) => orchestrator.handleImage(d),
    [QueueName.PRICING]: (d) => orchestrator.handlePricing(d),
    [QueueName.PUBLISH]: (d) => orchestrator.handlePublish(d),
  };

  const workers = Object.entries(handlers).map(([queue, handler]) => {
    const worker = new Worker(queue, async (job: Job<PipelineJobData>) => handler(job.data), {
      connection,
      concurrency: 4,
    });
    worker.on('failed', (job, err) => {
      logger.error(`[${queue}] job ${job?.id} falhou: ${err.message}`);
    });
    worker.on('completed', (job) => logger.log(`[${queue}] job ${job.id} concluído`));
    return worker;
  });

  logger.log(`Worker ativo — ${workers.length} filas: ${Object.keys(handlers).join(', ')}`);

  const shutdown = async () => {
    logger.log('Encerrando workers...');
    await Promise.all(workers.map((w) => w.close()));
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap();
