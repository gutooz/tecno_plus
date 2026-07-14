import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PipelineJobData, QueueName } from '@tecnoplus/shared';
// Import só de TIPO (apagado em runtime): evita o ciclo de import com o
// orquestrador, que injeta este QueueService. A instância é resolvida por token.
import type { PipelineOrchestrator } from './pipeline.orchestrator';

/** Token do PipelineOrchestrator (resolvido por string p/ não importar a classe). */
export const PIPELINE_ORCHESTRATOR = 'PIPELINE_ORCHESTRATOR';

export interface QueueStats {
  queue: QueueName;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

/**
 * Fachada de execução do pipeline — SEM Redis/BullMQ.
 *
 * Antes cada etapa era um job numa fila BullMQ (Redis). Como o worker rodava
 * 24/7 "cutucando" 6 filas, ele estourava a cota do Upstash (500k comandos) e
 * o /process passava a dar 500. Agora as etapas rodam no próprio processo, em
 * segundo plano: `enqueue` apenas agenda a execução (`setImmediate`) e retorna
 * na hora — mesmo "empurra e volta" que o BullMQ fazia, mas usando só o Mongo
 * para persistir estado. O orquestrador segue chamando `enqueue(PRÓXIMA)`, então
 * o encadeamento das etapas não mudou.
 *
 * Trade-off: sem fila não há retry automático nem durabilidade. Se o processo
 * reiniciar no meio, o produto fica em PROCESSING — o botão "Reprocessar"
 * (POST /products/:id/process) recomeça o pipeline.
 */
@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(private readonly moduleRef: ModuleRef) {}

  /** Agenda a execução de uma etapa em segundo plano (não bloqueia quem chamou). */
  async enqueue(queue: QueueName, data: PipelineJobData): Promise<void> {
    setImmediate(() => {
      void this.run(queue, data);
    });
  }

  /** Ponto de entrada do pipeline: começa pela visão. */
  async startPipeline(data: PipelineJobData): Promise<void> {
    await this.enqueue(QueueName.VISION, data);
  }

  /** Executa a etapa correspondente do orquestrador, isolando erros. */
  private async run(queue: QueueName, data: PipelineJobData): Promise<void> {
    // Resolvido preguiçosamente para evitar dependência circular com o orquestrador
    // (que injeta este QueueService).
    const orchestrator = this.moduleRef.get<PipelineOrchestrator>(PIPELINE_ORCHESTRATOR, {
      strict: false,
    });
    const handlers: Partial<Record<QueueName, (d: PipelineJobData) => Promise<void>>> = {
      [QueueName.VISION]: (d) => orchestrator.handleVision(d),
      [QueueName.MARKET]: (d) => orchestrator.handleMarket(d),
      [QueueName.CONTENT]: (d) => orchestrator.handleContent(d),
      [QueueName.IMAGE]: (d) => orchestrator.handleImage(d),
      [QueueName.PRICING]: (d) => orchestrator.handlePricing(d),
      [QueueName.PUBLISH]: (d) => orchestrator.handlePublish(d),
    };

    const handler = handlers[queue];
    if (!handler) {
      this.logger.error(`Etapa desconhecida: ${queue}`);
      return;
    }

    try {
      await handler(data);
    } catch (err) {
      // O orquestrador (withLog) já registra o log e marca o produto como ERROR;
      // aqui só evitamos que a rejeição vire "unhandled" no processo.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Etapa ${queue} falhou p/ ${data.productId}: ${message}`);
    }
  }

  /**
   * Sem filas Redis não há mais contadores de fila. Mantém a forma esperada pelo
   * dashboard retornando zeros (o progresso real fica no `status` do produto).
   */
  async stats(): Promise<QueueStats[]> {
    return Object.values(QueueName).map((queue) => ({
      queue,
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    }));
  }
}
