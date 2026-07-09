import type { AIProviderName } from '../types/enums';

/**
 * Camada de abstração de IA.
 *
 * REGRA ARQUITETURAL: nenhum serviço pode depender diretamente da OpenAI (ou
 * de qualquer SDK de provedor). Todos consomem `AIProvider`. Trocar de modelo
 * = trocar a implementação registrada, sem tocar nos agentes.
 */

export interface AIUsage {
  provider: AIProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** custo estimado em USD, quando calculável */
  estimatedCostUsd?: number;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AITextRequest {
  messages: AIMessage[];
  model?: string; // sobrescreve o default do provider
  temperature?: number;
  maxTokens?: number;
  /** Pede resposta estritamente em JSON (quando o provider suporta). */
  json?: boolean;
}

export interface AIVisionRequest {
  /** Instrução do que extrair da imagem. */
  prompt: string;
  /** Imagem como URL pública OU data URL base64. */
  imageUrl: string;
  model?: string;
  json?: boolean;
  maxTokens?: number;
}

export interface AICompletion<T = string> {
  /** Texto bruto retornado pelo modelo. */
  raw: string;
  /** Quando `json:true`, o objeto parseado (ou null se falhar). */
  data: T | null;
  usage: AIUsage;
}

/**
 * Contrato implementado por OpenAIProvider, ClaudeProvider, GeminiProvider.
 * Cada implementação vive em `shared/src/ai/*` e traduz este contrato para o
 * SDK específico. Métodos assíncronos, sempre retornam `usage` p/ os logs.
 */
export interface AIProvider {
  readonly name: AIProviderName;

  /** Geração de texto (títulos, descrições, SEO, regras de preço textualizadas). */
  generateText<T = string>(req: AITextRequest): Promise<AICompletion<T>>;

  /** Análise de imagem (extração de atributos do produto). */
  analyzeImage<T = string>(req: AIVisionRequest): Promise<AICompletion<T>>;

  /** Ping barato p/ health-check de credenciais. */
  healthCheck(): Promise<boolean>;
}

/** Token de injeção (Nest) e chave de resolução do factory. */
export const AI_PROVIDER = Symbol('AI_PROVIDER');
