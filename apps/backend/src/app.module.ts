import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { DatabaseModule } from './modules/database/database.module';
import { StorageModule } from './modules/storage/storage.module';
import { AiModule } from './modules/ai/ai.module';
import { QueuesModule } from './modules/queues/queues.module';
import { AgentsModule } from './agents/agents.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProductsModule } from './modules/products/products.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { PublishModule } from './modules/publish/publish.module';
import { OpsModule } from './modules/ops/ops.module';
import { HealthModule } from './modules/health/health.module';

/**
 * Módulo raiz. Ordem de importação: infra global (config, db, storage, ai,
 * queues, agents) e depois os módulos de feature (HTTP). O worker.ts reaproveita
 * este mesmo AppModule para ter acesso a agentes e orquestrador.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['../../.env', '.env'],
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ uri: config.get<string>('mongo.uri') }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: (config.get<number>('security.rateLimitTtl') ?? 60) * 1000,
          limit: config.get<number>('security.rateLimitMax') ?? 120,
        },
      ],
    }),
    DatabaseModule,
    StorageModule,
    AiModule,
    QueuesModule,
    AgentsModule,
    AuthModule,
    ProductsModule,
    UploadsModule,
    TelegramModule,
    PublishModule,
    OpsModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
