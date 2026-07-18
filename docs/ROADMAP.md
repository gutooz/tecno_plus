# Roadmap — evolução até escala

O produto entrega a **fundação arquitetural** e o **pipeline ponta-a-ponta** dos
6 agentes, com adapters e pontos de extensão para tudo que é externo, além da
**integração real com a Shopee via API** (OAuth, produto, pedido). Abaixo, a
evolução priorizada.

## Legenda

🟢 pronto · 🟡 parcial / stub com ponto de extensão · 🔴 futuro

## Estado atual

| Área                                                           | Estado | Observação                                                                                                                                                                                                                     |
| -------------------------------------------------------------- | :----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Monorepo, DI, filas, worker isolado                            |   🟢   |                                                                                                                                                                                                                                |
| Adapter de IA (OpenAI/Claude/Gemini)                           |   🟢   | troca por env                                                                                                                                                                                                                  |
| Vision / Content / Pricing agents                              |   🟢   | IA real + regras puras                                                                                                                                                                                                         |
| Image agent (HD/quadrada/WebP/thumb)                           |   🟢   | remoção de fundo é 🟡                                                                                                                                                                                                          |
| Market agent                                                   |   🟡   | `SampleMarketSource` (adapter substituível por API oficial)                                                                                                                                                                    |
| Publisher — WebsitePublisher                                   |   🟢   |                                                                                                                                                                                                                                |
| Integração Shopee — OAuth + API (`modules/integrations/`)      |   🟢   | conectar loja, publicar/atualizar produto, ler pedidos, testar conexão — falta só configurar `SHOPEE_PARTNER_ID/KEY` reais e, por produto, o `shopeeCategoryId` (a API exige categoria; a planilha de importação em massa não) |
| Publisher — Mercado Livre/Amazon                               |   🟡   | interfaces prontas, lançam `NotImplemented`                                                                                                                                                                                    |
| Auth JWT + refresh                                             |   🟢   | tokens em localStorage (migrar p/ cookie httpOnly)                                                                                                                                                                             |
| Dashboard / Produtos / Upload / Detalhe / Config / Integrações |   🟢   |                                                                                                                                                                                                                                |

## Prioridades (ordenadas)

### P0 — Robustez para produção

1. **Auth hardening**: refresh silencioso, cookies httpOnly, rotação de refresh
   token (hashes já previstos no schema `User`).
2. **Uploads resilientes**: upload em chunks + retomada; limitar tamanho/mime;
   antivírus/validação de imagem.
3. **Observabilidade**: métricas (Prometheus), tracing (OpenTelemetry),
   dashboard de filas (Bull Board), alertas de dead-letter.
4. **Idempotência do pipeline**: `jobId` já é determinístico; adicionar
   checkpoints para reprocessar só a etapa que falhou.

### P1 — Qualidade de dados e IA

5. **Fontes de mercado reais**: implementar `MarketSource` para Mercado Livre e
   Shopee via **APIs oficiais** (registrar no array `MARKET_SOURCES`).
6. **Remoção de fundo por IA** no Image Agent (ponto de extensão já demarcado).
7. **Fila de revisão**: UI dedicada para produtos `needs_review` e para separar
   múltiplos produtos detectados numa foto.
8. **Configurações persistidas**: endpoint de settings (prompt padrão, markup,
   idioma) sobrescrevendo os defaults por usuário/loja.

### P2 — Canais e integrações

9. **Publishers reais**: Shopee ✅ (via API, `modules/integrations/`);
   Mercado Livre e Amazon seguem como classes a preencher (mesmo padrão) +
   agendamento de publicação.
   9b. **Mapeamento de categoria/atributos Shopee**: hoje `shopeeCategoryId` é
   digitado manualmente por produto (a API não aceita texto livre nem
   "deixar em branco" como a planilha). Evolução natural: sincronizar
   `product.get_category`/`get_attributes` e oferecer um seletor na UI.
10. **ERPs / e-commerce**: Bling, Tiny, Omie, Nuvemshop, WooCommerce, Shopify —
    cada um como adapter, mesmo padrão dos publishers.

### P3 — Escala

11. **Extração em microsserviços**: cada agente já é isolado; empacotar
    `vision-agent`, `image-agent` etc. como serviços próprios consumindo as
    mesmas filas.
12. **Autoscaling de workers** por profundidade de fila.
13. **Cache** de pesquisa de mercado e de resultados de IA por EAN.

## Melhorias técnicas priorizadas

- [ ] Cobertura de testes: e2e dos endpoints críticos (upload→pipeline→publish).
- [ ] Rate limit por rota sensível + captcha no registro.
- [ ] Paginação por cursor na listagem de produtos (hoje offset).
- [ ] Índice único por EAN por loja para deduplicação de cadastro.
- [ ] Feature flags para habilitar canais de publicação por loja.
- [ ] CI (lint + test + build) e imagens de produção separando API e worker.
