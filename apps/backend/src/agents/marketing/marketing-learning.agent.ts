import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../../modules/ai/ai.service';
import { MARKETING_LEARNING_PROMPT } from './marketing-prompts';

export interface LearningSample {
  channel: string;
  type: string;
  theme: string;
  hour: number;
  engagement: number; // likes + comments + shares
  reach: number;
}

export interface LearningInsightRaw {
  summary: string;
  metric: string;
  confidence: number;
}

/**
 * AGENTE 9 (Marketing IA) — Learning.
 * Sintetiza padrões via IA a partir do histórico REAL de analytics — nunca
 * roda com amostra pequena demais pra não inventar "aprendizado" sem base
 * (`MIN_SAMPLES`). Alimenta o Marketing Planner (Fase 1) em iterações
 * futuras — por ora, os insights ficam disponíveis no dashboard/relatório.
 */
@Injectable()
export class MarketingLearningAgent {
  private readonly logger = new Logger(MarketingLearningAgent.name);
  static readonly MIN_SAMPLES = 5;

  constructor(private readonly ai: AiService) {}

  async synthesize(samples: LearningSample[]): Promise<LearningInsightRaw[] | null> {
    if (samples.length < MarketingLearningAgent.MIN_SAMPLES) return null;

    const request = {
      json: true,
      maxTokens: 1024,
      temperature: 0.3,
      messages: [
        { role: 'system' as const, content: MARKETING_LEARNING_PROMPT },
        {
          role: 'user' as const,
          content: `Posts publicados (${samples.length}):\n${JSON.stringify(samples, null, 2)}`,
        },
      ],
    };

    let res = await this.ai.generateText<{ insights: LearningInsightRaw[] }>(request);
    if (!res.data) {
      this.logger.warn('Learning sem JSON válido; repetindo.');
      res = await this.ai.generateText<{ insights: LearningInsightRaw[] }>(request);
    }

    return res.data?.insights ?? [];
  }
}
