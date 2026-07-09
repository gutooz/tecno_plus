import { Injectable, Logger } from '@nestjs/common';
import { ProductVisionAttributes } from '@tecnoplus/shared';
import { AiService } from '../modules/ai/ai.service';
import { VISION_PROMPT } from './prompts';

interface VisionRawResult {
  products: ProductVisionAttributes[];
  confidence: number;
  multipleProducts: boolean;
}

export interface VisionOutcome {
  attributes: ProductVisionAttributes;
  confidence: number;
  multipleProductsDetected: boolean;
  extraProducts: ProductVisionAttributes[];
  usage: { provider: string; model: string; inputTokens: number; outputTokens: number };
}

/**
 * AGENTE 1 — Vision Agent.
 * Lê a foto via IA Vision e extrai atributos estruturados do produto.
 * Detecta múltiplos produtos na mesma imagem e calcula confiança.
 */
@Injectable()
export class VisionAgent {
  private readonly logger = new Logger(VisionAgent.name);

  constructor(private readonly ai: AiService) {}

  async run(imageUrl: string): Promise<VisionOutcome> {
    const res = await this.ai.analyzeImage<VisionRawResult>({
      prompt: VISION_PROMPT,
      imageUrl,
      json: true,
      maxTokens: 1800,
    });

    const parsed = res.data;
    if (!parsed || !Array.isArray(parsed.products) || parsed.products.length === 0) {
      this.logger.warn('Vision não retornou produtos — marcando para revisão.');
      return {
        attributes: {},
        confidence: 0,
        multipleProductsDetected: false,
        extraProducts: [],
        usage: {
          provider: res.usage.provider,
          model: res.usage.model,
          inputTokens: res.usage.inputTokens,
          outputTokens: res.usage.outputTokens,
        },
      };
    }

    const [first, ...rest] = parsed.products;
    return {
      attributes: first,
      confidence: clamp01(parsed.confidence ?? 0.5),
      multipleProductsDetected: Boolean(parsed.multipleProducts) || rest.length > 0,
      extraProducts: rest,
      usage: {
        provider: res.usage.provider,
        model: res.usage.model,
        inputTokens: res.usage.inputTokens,
        outputTokens: res.usage.outputTokens,
      },
    };
  }
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
