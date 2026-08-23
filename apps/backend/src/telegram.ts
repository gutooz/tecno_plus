import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { TelegramService } from './modules/telegram/telegram.service';
import { SocialScheduler } from './modules/social/social.scheduler';
import { MarketingPublishScheduler } from './modules/marketing/marketing-publish.scheduler';
import { MarketingAutoScheduler } from './modules/marketing/marketing-auto.scheduler';

/**
 * Processo do BOT do Telegram. Reaproveita o AppModule (sem servidor HTTP),
 * pega o TelegramService e inicia o long-polling. Como só ESTE processo chama
 * `start()`, API e worker nunca duplicam o polling.
 *
 * Rodar: `npm run bot:dev` (dev) ou `npm run bot` (build).
 * Precisa de MongoDB e Redis no ar (npm run infra:up).
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: false });
  const logger = new Logger('TelegramBot');
  const bot = app.get(TelegramService);
  const scheduler = app.get(SocialScheduler);
  const marketingScheduler = app.get(MarketingPublishScheduler);
  const marketingAutoScheduler = app.get(MarketingAutoScheduler);

  const started = await bot.start();
  if (!started) {
    logger.error('Bot do Telegram não iniciou; verifique TELEGRAM_BOT_TOKEN.');
    await app.close();
    process.exit(1);
  }
  scheduler.start();
  marketingScheduler.start();
  marketingAutoScheduler.start();
  logger.log('Bot do Telegram iniciado. Aguardando fotos… (divulgação social diária ativa)');

  const shutdown = async () => {
    logger.log('Encerrando bot…');
    bot.stop();
    scheduler.stop();
    marketingScheduler.stop();
    marketingAutoScheduler.stop();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap();
