import { QueueName } from '@tecnoplus/shared';

/** Token de injeção por fila: QUEUE_<NOME>. */
export const QUEUE_TOKENS = Object.fromEntries(
  Object.values(QueueName).map((name) => [name, Symbol(`QUEUE_${name}`)]),
) as Record<QueueName, symbol>;

/** Token de um Map<QueueName, Queue> agregado, consumido pelo QueueService. */
export const QUEUES_MAP = Symbol('QUEUES_MAP');
