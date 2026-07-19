import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketingService } from './marketing.service';

/**
 * Publicação automática dos posts do calendário — mesmo espírito do
 * `SocialScheduler` (setInterval em processo, sem Redis/cron externo).
 *
 * NASCE DESATIVADO: só publica de verdade se `MARKETING_AUTO_PUBLISH=true`
 * no `.env` — mesma cautela de "inerte até configurar" já usada em
 * `PaidCampaignsService` (publicar de verdade na Página/perfil é tão
 * consequente quanto gastar dinheiro real em anúncio, e não deve acontecer
 * sozinho antes do operador optar por isso explicitamente).
 */
@Injectable()
export class MarketingPublishScheduler {
  private readonly logger = new Logger(MarketingPublishScheduler.name);
  private static readonly CHECK_INTERVAL_MS = 5 * 60 * 1000;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly marketing: MarketingService,
  ) {}

  start(): void {
    if (!this.config.get<boolean>('social.marketingAutoPublish')) {
      this.logger.log(
        'Publicação automática do Marketing IA desativada (defina MARKETING_AUTO_PUBLISH=true para ativar).',
      );
      return;
    }
    void this.tick();
    this.timer = setInterval(() => void this.tick(), MarketingPublishScheduler.CHECK_INTERVAL_MS);
    this.logger.log('Publicação automática do Marketing IA ativa.');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    try {
      await this.marketing.publishDuePosts();
    } catch (err) {
      this.logger.error(`Falha no tick de publicação automática: ${String(err)}`);
    }
  }
}
