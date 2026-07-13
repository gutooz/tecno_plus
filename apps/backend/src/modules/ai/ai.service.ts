import { Inject, Injectable, Logger } from '@nestjs/common';
import { AICompletion, AIProvider, AITextRequest, AIVisionRequest } from '@tecnoplus/shared';
import { AI_TEXT_PROVIDER, AI_VISION_PROVIDER } from './ai.tokens';

/**
 * Fachada de IA usada pelos agentes. Roteia por capacidade: imagens vão para o
 * provider de VISÃO (Gemini), textos para o de TEXTO (Claude). Centraliza o
 * logging de uso de tokens e isola os agentes dos tokens de injeção.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @Inject(AI_VISION_PROVIDER) private readonly visionProvider: AIProvider,
    @Inject(AI_TEXT_PROVIDER) private readonly textProvider: AIProvider,
  ) {}

  get providerName() {
    return this.textProvider.name;
  }

  get visionProviderName() {
    return this.visionProvider.name;
  }

  async generateText<T = string>(req: AITextRequest): Promise<AICompletion<T>> {
    const res = await this.textProvider.generateText<T>(req);
    this.logUsage('text', res);
    return res;
  }

  async analyzeImage<T = string>(req: AIVisionRequest): Promise<AICompletion<T>> {
    const res = await this.visionProvider.analyzeImage<T>(req);
    this.logUsage('vision', res);
    return res;
  }

  async healthCheck(): Promise<boolean> {
    const [vision, text] = await Promise.all([
      this.visionProvider.healthCheck(),
      this.textProvider.healthCheck(),
    ]);
    return vision && text;
  }

  private logUsage(kind: string, res: AICompletion<unknown>) {
    const { provider, model, inputTokens, outputTokens } = res.usage;
    this.logger.debug(
      `[${kind}] ${provider}/${model} tokens in=${inputTokens} out=${outputTokens}`,
    );
  }
}
