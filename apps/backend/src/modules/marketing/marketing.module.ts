import { Module } from '@nestjs/common';
import { MarketingService } from './marketing.service';
import { MarketingController } from './marketing.controller';
import { TrendHunterAgent } from '../../agents/marketing/trend-hunter.agent';
import { MarketingPlannerAgent } from '../../agents/marketing/marketing-planner.agent';
import { MarketingCopyAgent } from '../../agents/marketing/marketing-copy.agent';
import { MarketingImageAgent } from '../../agents/marketing/marketing-image.agent';
import { MarketingCalendarAgent } from '../../agents/marketing/marketing-calendar.agent';
import { MarketingPublisherAgent } from '../../agents/marketing/marketing-publisher.agent';
import { MarketingPublishScheduler } from './marketing-publish.scheduler';
import { MarketingVideoAgent } from '../../agents/marketing/marketing-video.agent';
import { MarketingAnalyticsAgent } from '../../agents/marketing/marketing-analytics.agent';
import { MarketingLearningAgent } from '../../agents/marketing/marketing-learning.agent';
import { MarketingAutoScheduler } from './marketing-auto.scheduler';

/**
 * Departamento de Marketing IA — models (`MarketingPost`/`MarketingInsight`/
 * `MarketingAnalytics`/`Product`) vêm do `DatabaseModule` global;
 * `AiService`/`GeminiImageClient` vêm do `AiModule` (`@Global()`) e
 * `StorageService` do `StorageModule` (também `@Global()`) — nenhum precisa
 * ser importado aqui.
 * Fase 0: dashboard agregado real. Fase 1: Trend Hunter + Marketing Planner.
 * Fase 2: Copywriter + Image. Fase 3: Calendar. Fase 4: Publisher + Editor
 * Manual (`MarketingPublishScheduler` é iniciado em `telegram.ts`, mesmo
 * processo de background do `SocialScheduler` — nunca no processo da API,
 * pra não duplicar publicação se a API escalar horizontalmente). Fase 5:
 * Video (slideshow Ken Burns via ffmpeg). Fase 6: Analytics + Learning —
 * módulo completo (Fases 0-6). Fase 7 (canais adicionais reais) é trabalho
 * futuro opcional, documentado, que depende de o operador criar apps/OAuth
 * em cada plataforma nova.
 */
@Module({
  controllers: [MarketingController],
  providers: [
    MarketingService,
    TrendHunterAgent,
    MarketingPlannerAgent,
    MarketingCopyAgent,
    MarketingImageAgent,
    MarketingCalendarAgent,
    MarketingPublisherAgent,
    MarketingPublishScheduler,
    MarketingVideoAgent,
    MarketingAnalyticsAgent,
    MarketingLearningAgent,
    MarketingAutoScheduler,
  ],
  exports: [MarketingService, MarketingPublishScheduler, MarketingAutoScheduler],
})
export class MarketingModule {}
