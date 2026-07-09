import { ConfigService } from '@nestjs/config';
import { RedisOptions } from 'ioredis';

/** Opções de conexão Redis compartilhadas por filas e workers (BullMQ). */
export function buildRedisOptions(config: ConfigService): RedisOptions {
  return {
    host: config.get<string>('redis.host'),
    port: config.get<number>('redis.port'),
    password: config.get<string>('redis.password') || undefined,
    maxRetriesPerRequest: null, // exigido pelo BullMQ
  };
}

export const REDIS_OPTIONS = Symbol('REDIS_OPTIONS');
