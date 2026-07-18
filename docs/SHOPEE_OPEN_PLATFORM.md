# Checklist — submissão como Shopee Open Platform "Third-party Partner"

Estado do projeto frente aos 7 critérios da Shopee, após a implementação da
integração real via API (`modules/integrations/`). Itens marcados **[código]**
já estão prontos no repositório; itens **[ação externa]** dependem de algo que
só o dono da conta pode fazer (credenciais, deploy, conta de teste).

## 1. Produto ativo e acessível publicamente

- **[código]** Nada bloqueia — é uma app web (Next.js + NestJS).
- **[ação externa]** Fazer o deploy real (ver [docs/DEPLOY.md](DEPLOY.md)) e, para a
  janela de avaliação, usar um plano "always on" (não o free tier do Render,
  que dorme sem tráfego) — cold start durante a avaliação passa a impressão
  errada de instabilidade.

## 2. Seção "Integrações" com integrações reais e funcionais

- **[código]** Feito. Tela `/integrations` + API:
  - OAuth completo (`shop/auth_partner` → `auth/token/get` → armazenamento com
    renovação automática do access_token).
  - `product.add_item` / `update_item` reais (upload de imagem ao Media Space,
    consulta ao vivo de canais logísticos habilitados).
  - `order.get_order_list` — pedidos reais da loja aparecem na tela.
  - `shop.get_shop_info` — botão "Testar conexão" prova a integração ao vivo.
- **[ação externa]** Nenhuma integração aparece "conectada" sem que o dono da
  conta:
  1. crie o app em `open.shopeemobile.com` (Live, não Sandbox, para a
     avaliação valer);
  2. preencha `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY`, `SHOPEE_REDIRECT_URL`
     no ambiente de produção;
  3. de fato clique em "Conectar loja Shopee" com uma loja real e autorize.

## 3. HTTPS com TLS 1.2+

- **[código]** Nada a fazer — Render/Vercel servem TLS 1.2/1.3 automaticamente
  em qualquer domínio `.onrender.com`/`.vercel.app` ou domínio próprio.
- **[ação externa]** Garantir que a URL informada no formulário da Shopee seja
  `https://` (não copiar a URL de dev `http://localhost`).

## 4. Conta de teste completa, acessível fora do Brasil

- **[código]** Auth JWT com registro aberto (`POST /auth/register`) — qualquer
  conta criada já tem acesso completo (não há planos/permissões que limitem
  funcionalidade). Sem geofencing/bloqueio por país no código.
- **[ação externa]** Criar a conta na instância de produção e testar o login
  de fora do Brasil (VPN) antes de informar usuário/senha no formulário.

## 5. Vídeo demonstrativo

- Não aplicável — é sistema web, não desktop/instalável.

## 6. Não ser bot de chat nem estar em fase de protótipo

- **[código]** README/ROADMAP atualizados — removida a linguagem "MVP —
  Fase 1"; a seção de Integrações documenta o que é real vs. em
  desenvolvimento (Mercado Livre/Amazon seguem como `NotImplemented`,
  claramente sinalizado só internamente/no roadmap, não na UI pública).
- **[ação externa]** No formulário, deixar explícito que o bot do Telegram é
  um canal de _intake_ de fotos para o pipeline de cadastro — não um chatbot
  de atendimento ao cliente.

## 7. Sem atividade suspeita

- **[código]** Confirmado limpo: `SampleMarketSource` (agente de pesquisa de
  mercado) gera preços sintéticos determinísticos — não faz scraping de
  anúncios de nenhuma plataforma, incluindo a própria Shopee.

---

## Limitações conhecidas da integração Shopee (honestidade > aparência)

- **Categoria por produto**: a API do Shopee `add_item` exige `category_id`
  numérico da árvore de categorias — diferente da planilha de importação em
  massa, que aceita deixar em branco. Hoje isso é um campo
  (`vision.shopeeCategoryId`) preenchido manualmente por produto; publicar sem
  ele falha com uma mensagem clara. Mapear a árvore de categorias
  automaticamente é o próximo passo natural (ver ROADMAP, item 9b).
- **Canais logísticos**: consultados ao vivo (`logistics/get_channel_list`) —
  se a loja não tiver nenhum canal habilitado no Seller Center, a publicação
  falha com mensagem explícita em vez de silenciosamente "funcionar" com dado
  inventado.
- **Nunca testado contra a Shopee real**: o código segue o esquema de
  assinatura e os payloads documentados publicamente pela Shopee Open
  Platform v2, mas não há credenciais de sandbox/produção neste ambiente para
  rodar uma chamada real de ponta a ponta. Antes de submeter, valide ao menos
  uma vez: conectar → testar conexão → publicar 1 produto → ver 1 pedido.
