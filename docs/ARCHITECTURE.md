# Arquitetura — Tecno Plus AI Catalog

## Visão de componentes

```mermaid
flowchart TB
  subgraph Client
    FE[Next.js 15 App Router]
  end
  subgraph Edge
    API[NestJS API - main.ts]
  end
  subgraph Background
    W[Worker - worker.ts]
  end
  subgraph Infra
    DB[(MongoDB)]
    RQ[(Redis / BullMQ)]
    ST[(MongoDB GridFS)]
  end
  subgraph External
    AI{{AIProvider: OpenAI | Claude | Gemini}}
    MS[[Market Sources]]
    MP[[Marketplace Publishers]]
  end

  FE -->|JWT REST| API
  API --> DB
  API --> ST
  API -->|enqueue| RQ
  RQ -->|consume| W
  W --> DB
  W --> ST
  W --> AI
  W --> MS
  W --> MP
```

**Princípio central:** a API é fina — autentica, valida, persiste e enfileira.
Todo trabalho caro (visão, geração de conteúdo, tratamento de imagem) vive no
**worker**, consumindo filas. Assim a interface nunca bloqueia.

## Pipeline dos agentes (sequência)

```mermaid
sequenceDiagram
  participant FE as Frontend
  participant API as API
  participant Q as BullMQ
  participant W as Worker
  participant DB as MongoDB
  participant AI as AIProvider

  FE->>API: POST /upload (imagens)
  API->>DB: cria Product (status=uploaded)
  API->>Q: enqueue VISION
  API-->>FE: 200 (ids) — sem esperar IA
  Q->>W: VISION job
  W->>AI: analyzeImage()
  AI-->>W: atributos + confiança
  W->>DB: salva vision
  W->>Q: enqueue MARKET
  Note over W,Q: MARKET → CONTENT → IMAGE → PRICING → PUBLISH
  W->>DB: status=published
  FE->>API: GET /products (polling/React Query)
```

## Camada de IA (Adapter)

```mermaid
classDiagram
  class AIProvider {
    <<interface>>
    +name
    +generateText(req) AICompletion
    +analyzeImage(req) AICompletion
    +healthCheck() boolean
  }
  AIProvider <|.. OpenAIProvider
  AIProvider <|.. ClaudeProvider
  AIProvider <|.. GeminiProvider
  class AiService {
    -provider: AIProvider
    +generateText()
    +analyzeImage()
  }
  AiService --> AIProvider : injeta AI_PROVIDER
  VisionAgent --> AiService
  ContentAgent --> AiService
```

O token `AI_PROVIDER` é resolvido em bootstrap (`ai.module.ts`) conforme
`AI_PROVIDER` do ambiente. Os agentes dependem de `AiService` / `AIProvider` —
**nunca** de um SDK. Trocar de modelo não toca em nenhum agente.

## Publicação multi-canal (Strategy)

```mermaid
classDiagram
  class MarketplacePublisher {
    <<interface>>
    +channel
    +enabled
    +publish(product)
    +unpublish(product)
    +update(product)
  }
  MarketplacePublisher <|.. WebsitePublisher
  MarketplacePublisher <|.. ShopeePublisher
  MarketplacePublisher <|.. MercadoLivrePublisher
  MarketplacePublisher <|.. AmazonPublisher
  PublisherAgent --> MarketplacePublisher : Map por canal
```

No MVP só `WebsitePublisher` está habilitado. Os demais implementam a interface
e lançam `NotImplemented` — os pontos de extensão já existem.

## Modelo de dados (coleções)

```mermaid
erDiagram
  USER ||--o{ PRODUCT : possui
  PRODUCT ||--o{ AGENTLOG : gera
  PRODUCT {
    string ownerId
    string internalSku
    string status
    number aiConfidence
    object vision
    object market
    object content
    object pricing
    object images
    string[] publishedChannels
  }
  AGENTLOG {
    string agent
    string productId
    string outcome
    number durationMs
    number inputTokens
    number outputTokens
    string aiModel
  }
  USER {
    string email
    string passwordHash
    string role
  }
```

Índices: texto em `vision.name / vision.brand / internalSku` (busca instantânea);
composto `ownerId + status + createdAt` (listagem/ordenação); `agent + createdAt`
em logs.

## Justificativas técnicas

1. **Monorepo com `shared` puro** — contratos e regras (ex.: precificação)
   ficam num pacote sem dependências, importado por back e front. Uma única
   fonte de verdade para tipos e cálculos, testável isoladamente.

2. **Filas por agente + encadeamento** — cada etapa é uma fila BullMQ própria.
   Isola falhas (um erro de imagem não derruba a visão), permite concorrência
   independente por etapa e dá retry/backoff/dead-letter de graça.

3. **API × Worker separados, mesmo AppModule** — reaproveita DI/config sem
   duplicar código. Em produção, escala horizontalmente o worker sem tocar na
   API.

4. **Adapters para tudo que é externo** (IA, fontes de mercado, publishers,
   storage) — a substituição por APIs oficiais no futuro é local e não altera a
   arquitetura, cumprindo o requisito de extensibilidade.

5. **Confiança da IA como gate** — abaixo do limiar, o produto vai para
   `needs_review` e o pipeline pausa, evitando publicar cadastros ruins.

6. **Segurança** — Helmet, CORS restrito, rate limit (Throttler), validação
   (class-validator) e JWT com refresh. Chaves de IA só no backend.
