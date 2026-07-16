import { Injectable, Logger } from '@nestjs/common';
import { ProductVisionAttributes } from '@tecnoplus/shared';
import { AiService } from '../modules/ai/ai.service';
import { WEIGHT_PROMPT } from './prompts';

interface WeightRawResult {
  weight: number;
  reasoning: string;
  confidence: number;
}

export interface WeightOutcome {
  /** kg com embalagem, ou null se a IA não devolveu número utilizável. */
  weight: number | null;
  reasoning: string;
  confidence: number;
  usage: { provider: string; model: string; inputTokens: number; outputTokens: number };
}

/**
 * AGENTE — Weight Agent.
 *
 * Estima o peso de POSTAGEM a partir dos atributos já extraídos pela visão
 * (material, tamanho, categoria, quantidade). É texto, não imagem: peso não se
 * lê numa foto, e os produtos que precisam disso já foram fotografados.
 *
 * Este é o único ponto do sistema que produz peso sem medição. O valor sai
 * marcado como `weightSource: 'estimado'` justamente para ser rastreável depois
 * — peso errado na Shopee é frete cobrado errado em cada venda.
 */
@Injectable()
export class WeightAgent {
  private readonly logger = new Logger(WeightAgent.name);

  constructor(private readonly ai: AiService) {}

  async run(vision: ProductVisionAttributes): Promise<WeightOutcome> {
    // Só o que ajuda a inferir massa — mandar o objeto inteiro só gasta token.
    const context = JSON.stringify(
      {
        name: vision.name ?? null,
        category: vision.category ?? null,
        subcategory: vision.subcategory ?? null,
        material: vision.material ?? null,
        size: vision.size ?? null,
        quantity: vision.quantity ?? null,
        packageText: vision.packageText ?? null,
        features: vision.features ?? [],
      },
      null,
      2,
    );

    const res = await this.ai.generateText<WeightRawResult>({
      json: true,
      maxTokens: 400,
      temperature: 0.2,
      messages: [
        { role: 'system' as const, content: WEIGHT_PROMPT },
        { role: 'user' as const, content: `Atributos do produto:\n${context}` },
      ],
    });

    const weight = normalizeWeight(res.data?.weight);
    if (weight == null) {
      this.logger.warn(`Peso não estimado para "${vision.name ?? '(sem nome)'}" — fica pendente.`);
    }

    return {
      weight,
      reasoning: res.data?.reasoning ?? '',
      confidence: clamp01(res.data?.confidence ?? 0),
      usage: {
        provider: res.usage.provider,
        model: res.usage.model,
        inputTokens: res.usage.inputTokens,
        outputTokens: res.usage.outputTokens,
      },
    };
  }
}

/**
 * Aceita só peso plausível. Devolver null é melhor que gravar lixo: o validador
 * do Shopee já sinaliza peso ausente, e aí o produto fica de fora do lote em vez
 * de subir com frete errado.
 */
function normalizeWeight(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  // 100kg é muito além de qualquer coisa que a Shopee aceite por envio comum;
  // um número desses é alucinação (ou gramas trocadas por quilos).
  if (n > 100) return null;
  return Number(n.toFixed(3));
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
