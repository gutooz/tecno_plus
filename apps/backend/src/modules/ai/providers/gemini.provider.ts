import { GenerationConfig, GoogleGenerativeAI } from '@google/generative-ai';
import {
  AICompletion,
  AIProvider,
  AIProviderName,
  AITextRequest,
  AIVisionRequest,
} from '@tecnoplus/shared';
import { fetchImageAsBase64, parseJsonLoose } from '../ai.utils';

export interface GeminiProviderConfig {
  apiKey: string;
  textModel: string;
  visionModel: string;
}

/** Adapter do Google Gemini. */
export class GeminiProvider implements AIProvider {
  readonly name = AIProviderName.GEMINI;
  private readonly client: GoogleGenerativeAI;

  constructor(private readonly config: GeminiProviderConfig) {
    this.client = new GoogleGenerativeAI(config.apiKey);
  }

  async generateText<T = string>(req: AITextRequest): Promise<AICompletion<T>> {
    const modelName = req.model ?? this.config.textModel;
    const system = req.messages.find((m) => m.role === 'system')?.content;
    // `gemini-flash-latest` é um modelo "thinking": por padrão gasta tokens
    // pensando ANTES de responder, e esse consumo entra no maxOutputTokens.
    // Em respostas JSON longas (ex.: Content Agent) isso estourava o limite e
    // truncava o JSON (finishReason MAX_TOKENS) — o parse falhava e o conteúdo
    // caía no fallback (descrição = título). Para texto estruturado desligamos
    // o thinking (thinkingBudget: 0) e damos folga no limite de saída.
    const generationConfig: GenerationConfig & {
      thinkingConfig?: { thinkingBudget?: number };
    } = {
      temperature: req.temperature ?? 0.4,
      maxOutputTokens: req.maxTokens ?? 4096,
      responseMimeType: req.json ? 'application/json' : undefined,
      thinkingConfig: { thinkingBudget: 0 },
    };
    const model = this.client.getGenerativeModel({
      model: modelName,
      systemInstruction: system,
      generationConfig,
    });

    const prompt = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => m.content)
      .join('\n');
    const res = await model.generateContent(prompt);
    const raw = res.response.text();
    const usage = res.response.usageMetadata;
    return {
      raw,
      data: req.json ? (parseJsonLoose<T>(raw) as T | null) : (raw as unknown as T),
      usage: {
        provider: this.name,
        model: modelName,
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
      },
    };
  }

  async analyzeImage<T = string>(req: AIVisionRequest): Promise<AICompletion<T>> {
    const modelName = req.model ?? this.config.visionModel;
    const { base64, mediaType } = await fetchImageAsBase64(req.imageUrl);
    const model = this.client.getGenerativeModel({
      model: modelName,
      generationConfig: {
        maxOutputTokens: req.maxTokens ?? 1500,
        responseMimeType: req.json ? 'application/json' : undefined,
      },
    });

    const res = await model.generateContent([
      { inlineData: { data: base64, mimeType: mediaType } },
      { text: req.prompt },
    ]);
    const raw = res.response.text();
    const usage = res.response.usageMetadata;
    return {
      raw,
      data: req.json ? (parseJsonLoose<T>(raw) as T | null) : (raw as unknown as T),
      usage: {
        provider: this.name,
        model: modelName,
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
      },
    };
  }

  async healthCheck(): Promise<boolean> {
    if (!this.config.apiKey) return false;
    try {
      const model = this.client.getGenerativeModel({ model: this.config.textModel });
      await model.generateContent('ping');
      return true;
    } catch {
      return false;
    }
  }
}
