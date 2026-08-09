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
    // Usado só pra montar o link https://t.me/<usuario>?start=... no site
    // (vínculo de chat do fornecedor). Sem ele, o site mostra só o código.
    botUsername: process.env.TELEGRAM_BOT_USERNAME ?? '',
  },

  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    bucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'product-images',
  },

  facebook: {
    appId: process.env.FACEBOOK_APP_ID ?? '',
    appSecret: process.env.FACEBOOK_APP_SECRET ?? '',
    pageId: process.env.FACEBOOK_PAGE_ID ?? '',
    pageAccessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? '',
    instagramBusinessAccountId: process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID ?? '',
    apiVersion: process.env.FACEBOOK_API_VERSION ?? 'v19.0',
    // Campanhas pagas (Marketing API) — inerte até estes dois estarem configurados.
    // `ads_management` normalmente exige um token com escopo mais amplo que o de
    // postagem orgânica; cai pro page token se nenhum for informado à parte.
    adAccountId: process.env.FACEBOOK_AD_ACCOUNT_ID ?? '',
    marketingApiToken:
      process.env.FACEBOOK_MARKETING_API_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '',
  },

  // Postagem automática diária (Facebook/Instagram) com aprovação via Telegram.
  social: {
    // Hora local (0-23) em que o rascunho diário é mandado pra aprovação.
    postHour: parseInt(process.env.SOCIAL_POST_HOUR ?? '9', 10),
    // Publicação automática dos posts do calendário do Marketing IA — nasce
    // DESATIVADA (mesma cautela do gasto real em `PaidCampaignsService`:
    // publicar de verdade na Página/perfil não deve acontecer sozinho antes
    // do operador optar por isso explicitamente).
    marketingAutoPublish: process.env.MARKETING_AUTO_PUBLISH === 'true',
    // Geração automática de conteúdo do Marketing IA (analisar tendência dos
    // produtos novos + gerar o próximo dia do calendário + gerar imagem de
    // cada post) — diferente de PUBLICAR: aqui nada sai do banco de dados,
    // então o padrão é LIGADO. Consome cota de IA (Gemini/Claude) todo dia.
    marketingAutoGenerate: process.env.MARKETING_AUTO_GENERATE !== 'false',
    // Hora local (0-23) em que a geração automática diária roda.
    marketingGenerateHour: parseInt(process.env.MARKETING_GENERATE_HOUR ?? '6', 10),
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
    // Chave simétrica p/ criptografar (AES-256-GCM) access_token/refresh_token
    // das integrações (Shopee, Mercado Livre) em repouso no Mongo. Mesmo
    // padrão do JWT_SECRET: qualquer string forte serve — troque em produção.
    tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY ?? 'dev-token-key-troque-em-producao',
  },

  // ── Shopee Open Platform (integração real via API, não a exportação em massa) ──
  shopee: {
    partnerId: process.env.SHOPEE_PARTNER_ID ?? '',
    partnerKey: process.env.SHOPEE_PARTNER_KEY ?? '',
    webhookUrl: process.env.SHOPEE_WEBHOOK_URL ?? '',
    region: process.env.SHOPEE_REGION ?? 'BR',
    environment: process.env.SHOPEE_ENVIRONMENT ?? 'production',
    // API: produção https://partner.shopeemobile.com · sandbox https://partner.test-stable.shopeemobile.com
    host: process.env.SHOPEE_API_HOST ?? 'https://partner.shopeemobile.com',
    // Tela de autorização: no sandbox a Shopee usa outro domínio.
    authHost:
      process.env.SHOPEE_AUTH_HOST ??
      process.env.SHOPEE_API_HOST ??
      'https://partner.shopeemobile.com',
    // URL pública do backend + "/api/integrations/shopee/callback" (deve ser https
    // e estar cadastrada exatamente igual no app da Shopee Open Platform).
    redirectUrl: process.env.SHOPEE_REDIRECT_URL ?? '',
  },

  // ── Mercado Livre (integração real via API, OAuth2 + PKCE) ──
  mercadoLivre: {
    clientId: process.env.MERCADO_LIVRE_CLIENT_ID ?? '',
    clientSecret: process.env.MERCADO_LIVRE_CLIENT_SECRET ?? '',
    // Autorização (login+aceite do vendedor): domínio varia por país (.com.br no Brasil).
    authHost: process.env.MERCADO_LIVRE_AUTH_HOST ?? 'https://auth.mercadolivre.com.br',
    // API de negócio (token, items, categories, users): mesmo host em todos os países.
    apiHost: process.env.MERCADO_LIVRE_API_HOST ?? 'https://api.mercadolibre.com',
    // URL pública do backend + "/api/integrations/mercado-livre/callback" (deve ser
    // https e estar cadastrada exatamente igual no app do DevCenter).
    redirectUrl: process.env.MERCADO_LIVRE_REDIRECT_URI ?? '',
  },
});
