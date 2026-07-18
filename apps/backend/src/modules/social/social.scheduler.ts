import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialApprovalService } from './social.service';
import { CampaignsService } from '../campaigns/campaigns.service';

/**
 * Agendador diário da divulgação social — SEM Redis/cron externo, no mesmo
 * espírito do `QueueService` (ver comentário lá: Upstash estourava cota).
 * Roda dentro do processo `telegram.ts`, que já fica de pé 24h no Render.
 * Checa 1x/hora se já passou do horário configurado (`SOCIAL_POST_HOUR`) e
 * ainda não mandou rascunho hoje; se sim, escolhe o próximo produto e manda
 * pro Telegram aprovar. `tick()` roda também no `start()` pra não depender de
 * esperar a próxima hora cheia (útil se o processo reiniciar depois do horário).
 */
@Injectable()
export class SocialScheduler {
  private readonly logger = new Logger(SocialScheduler.name);
  private static readonly CHECK_INTERVAL_MS = 60 * 60 * 1000;
  private lastRunDate = '';
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly social: SocialApprovalService,
    private readonly campaigns: CampaignsService,
  ) {}

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), SocialScheduler.CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const postHour = this.config.get<number>('social.postHour') ?? 9;
    if (this.lastRunDate === today || now.getHours() < postHour) return;

    this.lastRunDate = today; // marca antes de tentar: não reprocessa na mesma hora em caso de erro
    try {
      const candidate = await this.social.pickNextCandidate();
      if (!candidate) {
        this.logger.log('Nenhum produto pendente de divulgação social hoje.');
      } else {
        await this.social.sendForApproval(candidate);
      }
    } catch (err) {
      this.logger.error(`Falha no agendamento social diário: ${String(err)}`);
    }

    // Isolado em try/catch próprio: um bug numa campanha nunca pode derrubar o pick diário acima.
    try {
      await this.campaigns.processDueOrganicItems((product) =>
        this.social.sendForApproval(product),
      );
    } catch (err) {
      this.logger.error(`Falha ao processar itens de campanhas orgânicas: ${String(err)}`);
    }
  }
}
