/**
 * Configuração tipada centralizada. Lida a partir de variáveis de ambiente.
 * Consumida via ConfigService com paths (ex.: config.get('ai.provider')).
 */
export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.BACKEND_PORT ?? '3333', 10),

  mongo: {
    uri: process.env.MONGO_URI ?? 'mongodb://localhost:27017/tecnoplus',
    dbName: process.env.MONGO_DB_NAME ?? 'tecnoplus',
  },

  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  ai: {
    provider: process.env.AI_PROVIDER ?? 'openai',
    visionModel: process.env.AI_VISION_MODEL ?? 'gpt-4o',
    textModel: process.env.AI_TEXT_MODEL ?? 'gpt-4o-mini',
    openaiKey: process.env.OPENAI_API_KEY ?? '',
    anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
    geminiKey: process.env.GEMINI_API_KEY ?? '',
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
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    rateLimitTtl: parseInt(process.env.RATE_LIMIT_TTL ?? '60', 10),
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX ?? '120', 10),
  },
});
