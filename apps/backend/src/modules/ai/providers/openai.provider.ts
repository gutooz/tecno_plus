import OpenAI from 'openai';
import {
  AICompletion,
  AIProvider,
  AIProviderName,
  AITextRequest,
  AIVisionRequest,
} from '@tecnoplus/shared';
import { parseJsonLoose } from '../ai.utils';

export interface OpenAIProviderConfig {
  apiKey: string;
  textModel: string;
  visionModel: string;
}

/**
 * Adapter da OpenAI. Traduz o contrato `AIProvider` para o SDK oficial.
 * Nenhum agente conhece esta classe diretamente — recebem `AIProvider`.
 */
export class OpenAIProvider implements AIProvider {
  readonly name = AIProviderName.OPENAI;
  private readonly client: OpenAI;

  constructor(private readonly config: OpenAIProviderConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
  }

  async generateText<T = string>(req: AITextRequest): Promise<AICompletion<T>> {
    const model = req.model ?? this.config.textModel;
    const res = await this.client.chat.completions.create({
      model,
      temperature: req.temperature ?? 0.4,
      max_tokens: req.maxTokens ?? 1500,
      response_format: req.json ? { type: 'json_object' } : undefined,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const raw = res.choices[0]?.message?.content ?? '';
    return {
      raw,
      data: req.json ? (parseJsonLoose<T>(raw) as T | null) : (raw as unknown as T),
      usage: {
        provider: this.name,
        model,
        inputTokens: res.usage?.prompt_tokens ?? 0,
        outputTokens: res.usage?.completion_tokens ?? 0,
      },
    };
  }

  async analyzeImage<T = string>(req: AIVisionRequest): Promise<AICompletion<T>> {
    const model = req.model ?? this.config.visionModel;
    const imageUrls = [req.imageUrl, ...(req.imageUrls ?? [])];
    const res = await this.client.chat.completions.create({
      model,
      max_tokens: req.maxTokens ?? 1500,
      response_format: req.json ? { type: 'json_object' } : undefined,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: req.prompt },
            ...imageUrls.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
          ],
        },
      ],
    });

    const raw = res.choices[0]?.message?.content ?? '';
    return {
      raw,
      data: req.json ? (parseJsonLoose<T>(raw) as T | null) : (raw as unknown as T),
      usage: {
        provider: this.name,
        model,
        inputTokens: res.usage?.prompt_tokens ?? 0,
        outputTokens: res.usage?.completion_tokens ?? 0,
      },
    };
  }

  async healthCheck(): Promise<boolean> {
    if (!this.config.apiKey) return false;
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}
