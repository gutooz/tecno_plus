import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { DEFAULT_JOB_OPTIONS, QueueName } from '@tecnoplus/shared';
import { buildRedisOptions } from './redis.connection';
import { QueueService } from './queue.service';
import { QUEUE_TOKENS, QUEUES_MAP } from './queues.tokens';

const queueProviders = Object.values(QueueName).map((name) => ({
  provide: QUEUE_TOKENS[name],
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    new Queue(name, {
      connection: buildRedisOptions(config),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    }),
}));

const queuesMapProvider = {
  provide: QUEUES_MAP,
  inject: Object.values(QueueName).map((name) => QUEUE_TOKENS[name]),
  useFactory: (...queues: Queue[]) =>
    new Map<QueueName, Queue>(Object.values(QueueName).map((name, i) => [name, queues[i]])),
};

/**
 * Registra uma Queue BullMQ por nome de fila e o QueueService (fachada de
 * enfileiramento usada pela API). O PROCESSAMENTO fica no worker.ts, não aqui —
 * a API só enfileira, nunca processa (nunca bloqueia a interface).
 */
@Global()
@Module({
  providers: [...queueProviders, queuesMapProvider, QueueService],
  exports: [...queueProviders.map((p) => p.provide), queuesMapProvider, QueueService],
})
export class QueuesModule {}
