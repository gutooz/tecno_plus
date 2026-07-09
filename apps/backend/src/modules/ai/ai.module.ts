import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_PROVIDER, AIProvider, AIProviderName } from '@tecnoplus/shared';
import { OpenAIProvider } from './providers/openai.provider';
import { ClaudeProvider } from './providers/claude.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { AiService } from './ai.service';

/**
 * Módulo de IA. Resolve, em tempo de bootstrap, QUAL provider concreto atende
 * ao token `AI_PROVIDER`, com base em `AI_PROVIDER` do ambiente. Trocar de
 * modelo é só mudar a env — nenhum consumidor muda.
 *
 * @Global para que qualquer agente injete `AI_PROVIDER`/`AiService` sem reimport.
 */
@Global()
@Module({
  providers: [
    {
      provide: AI_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AIProvider => {
        const selected = config.get<string>('ai.provider') as AIProviderName;
        const shared = {
          textModel: config.get<string>('ai.textModel')!,
          visionModel: config.get<string>('ai.visionModel')!,
        };

        switch (selected) {
          case AIProviderName.CLAUDE:
            return new ClaudeProvider({ apiKey: config.get('ai.anthropicKey')!, ...shared });
          case AIProviderName.GEMINI:
            return new GeminiProvider({ apiKey: config.get('ai.geminiKey')!, ...shared });
          case AIProviderName.OPENAI:
          default:
            return new OpenAIProvider({ apiKey: config.get('ai.openaiKey')!, ...shared });
        }
      },
    },
    AiService,
  ],
  exports: [AI_PROVIDER, AiService],
})
export class AiModule {}
