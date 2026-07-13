import { Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PipelineJobData, QueueName } from '@tecnoplus/shared';
import { QUEUES_MAP } from './queues.tokens';

export interface QueueStats {
  queue: QueueName;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

/**
 * Fachada de enfileiramento. A API usa `enqueue` para iniciar/avançar o
 * pipeline; o dashboard usa `stats` para métricas de fila em tempo real.
 */
@Injectable()
export class QueueService {
  constructor(@Inject(QUEUES_MAP) private readonly queues: Map<QueueName, Queue>) {}

  /** Coloca um job na fila indicada (inicia ou avança o pipeline). */
  async enqueue(queue: QueueName, data: PipelineJobData): Promise<void> {
    const q = this.queues.get(queue);
    if (!q) throw new Error(`Fila desconhecida: ${queue}`);
    await q.add(queue, { ...data, from: queue }, { jobId: `${queue}:${data.productId}` });
  }

  /** Ponto de entrada do pipeline: começa pela visão. */
  async startPipeline(data: PipelineJobData): Promise<void> {
    await this.enqueue(QueueName.VISION, data);
  }

  async stats(): Promise<QueueStats[]> {
    const result: QueueStats[] = [];
    for (const [name, q] of this.queues) {
      const counts = await q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
      result.push({
        queue: name,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
      });
    }
    return result;
  }
}
