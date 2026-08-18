import Anthropic from '@anthropic-ai/sdk';
import {
  AICompletion,
  AIProvider,
  AIProviderName,
  AITextRequest,
  AIVisionRequest,
} from '@tecnoplus/shared';
import { fetchImageAsBase64, parseJsonLoose } from '../ai.utils';

export interface ClaudeProviderConfig {
  apiKey: string;
  textModel: string;
  visionModel: string;
}

/** Adapter da Anthropic (Claude). Mesmo contrato, SDK diferente. */
export class ClaudeProvider implements AIProvider {
  readonly name = AIProviderName.CLAUDE;
  private readonly client: Anthropic;

  constructor(private readonly config: ClaudeProviderConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  private splitSystem(req: AITextRequest): { system?: string; messages: Anthropic.MessageParam[] } {
    const system = req.messages.find((m) => m.role === 'system')?.content;
    const messages = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    return { system, messages };
  }

  async generateText<T = string>(req: AITextRequest): Promise<AICompletion<T>> {
    const model = req.model ?? this.config.textModel;
    const { system, messages } = this.splitSystem(req);
    const res = await this.client.messages.create({
      model,
      max_tokens: req.maxTokens ?? 1500,
      temperature: req.temperature ?? 0.4,
      system: req.json ? `${system ?? ''}\nResponda SOMENTE com JSON válido.`.trim() : system,
      messages,
    });

    const raw = res.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
    return {
      raw,
      data: req.json ? (parseJsonLoose<T>(raw) as T | null) : (raw as unknown as T),
      usage: {
        provider: this.name,
        model,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      },
    };
  }

  async analyzeImage<T = string>(req: AIVisionRequest): Promise<AICompletion<T>> {
    const model = req.model ?? this.config.visionModel;
    const images = await Promise.all(
      [req.imageUrl, ...(req.imageUrls ?? [])].map(fetchImageAsBase64),
    );
    const res = await this.client.messages.create({
      model,
      max_tokens: req.maxTokens ?? 1500,
      messages: [
        {
          role: 'user',
          content: [
            ...images.map(({ base64, mediaType }) => ({
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: mediaType as never, data: base64 },
            })),
            {
              type: 'text',
              text: req.json ? `${req.prompt}\nResponda SOMENTE com JSON válido.` : req.prompt,
            },
          ],
        },
      ],
    });

    const raw = res.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
    return {
      raw,
      data: req.json ? (parseJsonLoose<T>(raw) as T | null) : (raw as unknown as T),
      usage: {
        provider: this.name,
        model,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      },
    };
  }

  async healthCheck(): Promise<boolean> {
    if (!this.config.apiKey) return false;
    try {
      await this.client.messages.create({
        model: this.config.textModel,
        max_tokens: 4,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return true;
    } catch {
      return false;
    }
  }
}
