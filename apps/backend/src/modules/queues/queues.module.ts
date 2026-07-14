import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service';

/**
 * Expõe o QueueService (fachada de execução do pipeline). Não há mais Redis nem
 * BullMQ: as etapas rodam no próprio processo (ver queue.service.ts). O
 * QueueService resolve o PipelineOrchestrator sob demanda via ModuleRef.
 */
@Global()
@Module({
  providers: [QueueService],
  exports: [QueueService],
})
export class QueuesModule {}
