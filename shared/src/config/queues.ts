/**
 * Topologia de filas (BullMQ). Uma fila por agente + fluxo de retentativa.
 * O pipeline é encadeado: cada processador, ao concluir, enfileira o próximo.
 *
 *   upload → vision → market → content → image → pricing → publish
 *                                   ↘ (falha) → retry → dead-letter
 */
export const QueueName = {
  UPLOAD: 'upload',
  VISION: 'vision',
  MARKET: 'market',
  CONTENT: 'content',
  IMAGE: 'image',
  PRICING: 'pricing',
  PUBLISH: 'publish',
  RETRY: 'retry',
  DEAD_LETTER: 'dead-letter',
} as const;
export type QueueName = (typeof QueueName)[keyof typeof QueueName];

/** Ordem canônica do pipeline; usada para encadear e para exibir progresso. */
export const PIPELINE_ORDER: QueueName[] = [
  QueueName.VISION,
  QueueName.MARKET,
  QueueName.CONTENT,
  QueueName.IMAGE,
  QueueName.PRICING,
  QueueName.PUBLISH,
];

/** Configuração padrão de jobs — retentativa com backoff exponencial. */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: false, // mantém p/ inspeção antes da dead-letter
};

/** Payload que flui pelo pipeline — sempre carrega o productId. */
export interface PipelineJobData {
  productId: string;
  ownerId: string;
  /** Fila de origem, útil p/ roteamento de retry. */
  from?: QueueName;
  attempt?: number;
}
