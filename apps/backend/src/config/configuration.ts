/**
 * Configuração tipada centralizada. Lida a partir de variáveis de ambiente.
 * Consumida via ConfigService com paths (ex.: config.get('ai.provider')).
 */
export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  // Render/Heroku injetam PORT dinamicamente; localmente usamos BACKEND_PORT
  port: parseInt(process.env.PORT ?? process.env.BACKEND_PORT ?? '3333', 10),

  mongo: {
    uri: process.env.MONGO_URI ?? 'mongodb://localhost:27017/tecnoplus',
    dbName: process.env.MONGO_DB_NAME ?? 'tecnoplus',
  },

  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  ai: {
    // Provedor padrão; pode ser sobrescrito por capacidade abaixo.
    provider: process.env.AI_PROVIDER ?? 'gemini',
    // Gemini trata/lê as IMAGENS; Claude escreve os TÍTULOS/descrições.
    visionProvider: process.env.AI_VISION_PROVIDER ?? process.env.AI_PROVIDER ?? 'gemini',
    textProvider: process.env.AI_TEXT_PROVIDER ?? process.env.AI_PROVIDER ?? 'claude',
    visionModel: process.env.AI_VISION_MODEL ?? 'gemini-flash-latest',
    textModel: process.env.AI_TEXT_MODEL ?? 'claude-haiku-4-5',
    // Modelo de geração/edição de imagem (Gemini "Nano Banana") — recorta o
    // fundo e recompõe o produto num fundo limpo para as imagens da Shopee.
    imageModel: process.env.AI_IMAGE_MODEL ?? 'gemini-2.5-flash-image',
    openaiKey: process.env.OPENAI_API_KEY ?? '',
    anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
    geminiKey: process.env.GEMINI_API_KEY ?? '',
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    // IDs autorizados a cadastrar (o resto é ignorado).
    allowedChatIds: (process.env.TELEGRAM_CHAT_ID ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // Catálogo compartilhado: todos os cadastros do bot caem sob este dono
    // (assim a dedup vale para o time inteiro, sem produto repetido).
    ownerId: process.env.TELEGRAM_OWNER_ID ?? 'bras',
  },

  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    bucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'product-images',
  },

  pricing: {
    tier1: parseFloat(process.env.PRICING_MARKUP_TIER1 ?? '1.20'),
    tier2: parseFloat(process.env.PRICING_MARKUP_TIER2 ?? '0.90'),
    tier3: parseFloat(process.env.PRICING_MARKUP_TIER3 ?? '0.70'),
    tier4: parseFloat(process.env.PRICING_MARKUP_TIER4 ?? '0.50'),
  },

  security: {
    // Aceita 1+ origens separadas por vírgula (ex.: domínio próprio + onrender.com).
    corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    rateLimitTtl: parseInt(process.env.RATE_LIMIT_TTL ?? '60', 10),
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX ?? '120', 10),
  },
});
