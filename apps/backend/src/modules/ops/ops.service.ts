import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProductStatus } from '@tecnoplus/shared';
import { AgentLog, AgentLogDocument } from '../database/schemas/agent-log.schema';
import { ProductsService } from '../products/products.service';
import { QueueService } from '../queues/queue.service';

@Injectable()
export class OpsService {
  constructor(
    @InjectModel(AgentLog.name) private readonly logs: Model<AgentLogDocument>,
    private readonly products: ProductsService,
    private readonly queue: QueueService,
  ) {}

  /** Indicadores do dashboard. */
  async dashboard(ownerId: string) {
    const [counts, queues, avg] = await Promise.all([
      this.products.countsByStatus(ownerId),
      this.queue.stats(),
      this.averageAgentDuration(),
    ]);

    const activeAi = queues.find((q) => q.queue === 'vision')?.active ?? 0;
    return {
      products: {
        processed: sum(counts),
        published: counts[ProductStatus.PUBLISHED] ?? 0,
        waiting: (counts[ProductStatus.UPLOADED] ?? 0) + (counts[ProductStatus.PROCESSING] ?? 0),
        error: counts[ProductStatus.ERROR] ?? 0,
        reviewing: counts[ProductStatus.NEEDS_REVIEW] ?? 0,
      },
      averageAgentDurationMs: avg,
      aiRunning: queues.reduce((acc, q) => acc + q.active, 0),
      queues,
      byStatus: counts,
    };
  }

  async recentLogs(limit = 100) {
    return this.logs.find().sort({ createdAt: -1 }).limit(Math.min(500, limit)).lean();
  }

  async jobs() {
    return this.queue.stats();
  }

  private async averageAgentDuration(): Promise<number> {
    const [row] = await this.logs.aggregate<{ avg: number }>([
      { $match: { outcome: 'success' } },
      { $group: { _id: null, avg: { $avg: '$durationMs' } } },
    ]);
    return Math.round(row?.avg ?? 0);
  }
}

function sum(obj: Record<string, number>): number {
  return Object.values(obj).reduce((a, b) => a + b, 0);
}
