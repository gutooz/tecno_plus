import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AI_PROVIDER,
  AICompletion,
  AIProvider,
  AITextRequest,
  AIVisionRequest,
} from '@tecnoplus/shared';

/**
 * Fachada de IA usada pelos agentes. Centraliza logging de uso de tokens e
 * isola os agentes até do token `AI_PROVIDER`. Se amanhã quisermos rotear por
 * custo/latência entre providers, a lógica entra aqui sem tocar nos agentes.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(@Inject(AI_PROVIDER) private readonly provider: AIProvider) {}

  get providerName() {
    return this.provider.name;
  }

  async generateText<T = string>(req: AITextRequest): Promise<AICompletion<T>> {
    const res = await this.provider.generateText<T>(req);
    this.logUsage('text', res);
    return res;
  }

  async analyzeImage<T = string>(req: AIVisionRequest): Promise<AICompletion<T>> {
    const res = await this.provider.analyzeImage<T>(req);
    this.logUsage('vision', res);
    return res;
  }

  healthCheck(): Promise<boolean> {
    return this.provider.healthCheck();
  }

  private logUsage(kind: string, res: AICompletion<unknown>) {
    const { provider, model, inputTokens, outputTokens } = res.usage;
    this.logger.debug(
      `[${kind}] ${provider}/${model} tokens in=${inputTokens} out=${outputTokens}`,
    );
  }
}
