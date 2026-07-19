import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_PROVIDER, AIProvider, AIProviderName } from '@tecnoplus/shared';
import { OpenAIProvider } from './providers/openai.provider';
import { ClaudeProvider } from './providers/claude.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { AiService } from './ai.service';
import { AI_TEXT_PROVIDER, AI_VISION_PROVIDER } from './ai.tokens';
import { GeminiImageClient } from './gemini-image.client';

/** Constrói o provider concreto a partir do nome (openai|claude|gemini). */
function buildProvider(name: string, config: ConfigService): AIProvider {
  const shared = {
    textModel: config.get<string>('ai.textModel')!,
    visionModel: config.get<string>('ai.visionModel')!,
  };
  switch (name as AIProviderName) {
    case AIProviderName.CLAUDE:
      return new ClaudeProvider({ apiKey: config.get('ai.anthropicKey')!, ...shared });
    case AIProviderName.GEMINI:
      return new GeminiProvider({ apiKey: config.get('ai.geminiKey')!, ...shared });
    case AIProviderName.OPENAI:
    default:
      return new OpenAIProvider({ apiKey: config.get('ai.openaiKey')!, ...shared });
  }
}

/**
 * Módulo de IA com providers POR CAPACIDADE:
 *  - VISÃO  (`ai.visionProvider`, default gemini) → analisa/trata imagens
 *  - TEXTO  (`ai.textProvider`,   default claude) → gera títulos/descrições
 * Trocar qualquer um é só mudar a env — nenhum agente muda. `AI_PROVIDER`
 * (token legado) permanece como alias do provider padrão.
 */
@Global()
@Module({
  providers: [
    {
      provide: AI_VISION_PROVIDER,
      inject: [ConfigService],
      useFactory: (c: ConfigService) => buildProvider(c.get<string>('ai.visionProvider')!, c),
    },
    {
      provide: AI_TEXT_PROVIDER,
      inject: [ConfigService],
      useFactory: (c: ConfigService) => buildProvider(c.get<string>('ai.textProvider')!, c),
    },
    {
      provide: AI_PROVIDER,
      inject: [ConfigService],
      useFactory: (c: ConfigService) => buildProvider(c.get<string>('ai.provider')!, c),
    },
    AiService,
    GeminiImageClient,
  ],
  exports: [AI_VISION_PROVIDER, AI_TEXT_PROVIDER, AI_PROVIDER, AiService, GeminiImageClient],
})
export class AiModule {}
