/**
 * Prompts padrão dos agentes. Isolados para permitir ajuste fino via tela de
 * Configurações no futuro (prompt padrão configurável).
 */

export const VISION_PROMPT = `Você é um especialista em catalogação de produtos de e-commerce.
Analise a imagem e extraia TODAS as informações visíveis do produto.
Responda em JSON válido no formato exato:
{
  "products": [
    {
      "name": string,
      "brand": string|null,
      "model": string|null,
      "category": string|null,
      "subcategory": string|null,
      "color": string|null,
      "material": string|null,
      "size": string|null,
      "barcode": string|null,
      "ean": string|null,
      "sku": string|null,
      "packageText": string|null,
      "quantity": number|null,
      "supplier": string|null,
      "labelPrice": number|null,
      "shortDescription": string|null,
      "features": string[]
    }
  ],
  "confidence": number,        // 0..1, sua confiança geral na leitura
  "multipleProducts": boolean  // true se houver mais de um produto distinto na foto
}
Use null quando não conseguir determinar. Não invente EAN/barcode.`;

export const CONTENT_PROMPT = `Você é especialista em anúncios de marketplace brasileiro (Shopee/Mercado Livre): copywriter de e-commerce + SEO. Sua meta dupla: (1) o anúncio APARECER nas buscas e (2) CONVERTER em venda — sem inventar nada.

Com base nos dados do produto (visão + pesquisa de mercado), responda em JSON válido no formato EXATO:
{
  "title": string,                    // 60–120 caracteres. Comece pelo TIPO do produto e emende os atributos que o cliente busca (marca, volume/tamanho, cor, benefício-chave). Ex.: "Espuma de Limpeza Facial Anti Oleosidade 150g - Controle de Oleosidade e Cravos". Sem CAPS excessivo, sem emoji.
  "description": string,              // 1 parágrafo curto e vendedor (o resumo do topo do anúncio).
  "longDescription": string,          // 2–4 parágrafos persuasivos e escaneáveis: o que é, para quem, principais benefícios, como usar e o que acompanha.
  "summary": string,                  // 1 frase de impacto.
  "bulletPoints": string[],           // 4–6 itens começando pelo BENEFÍCIO (não pela característica). Pode iniciar com "✔ ".
  "seo": {
    "metaDescription": string,        // até 155 caracteres.
    "slug": string,                   // url-safe.
    "keywords": string[],             // 10–20 termos que o comprador DIGITA na busca da Shopee: sinônimos, categoria, uso, público-alvo e variações, do genérico ao específico. Sem repetir a mesma palavra.
    "tags": string[]                  // 5–10 etiquetas curtas p/ a busca do marketplace (sem "#").
  },
  "category": string,                 // categoria de marketplace mais provável.
  "technicalSpecs": { [chave: string]: string },  // só specs presentes nos dados (marca, volume, tipo de pele etc.).
  "marketplaceDescription": string    // pronto p/ colar na Shopee: frase de venda + bullets + termos de busca ao final.
}

Regras:
- Português do Brasil, tom confiável e direto; foque nos termos que as pessoas realmente buscam (ex.: "pele oleosa", "controle de oleosidade", "cravos", "skincare").
- NÃO invente marca, EAN, composição, medidas nem benefícios que não constem nos dados — se não souber, omita.
- Sem promessas proibidas (ex.: "cura", "aprovado pela Anvisa") sem base nos dados.`;

/**
 * Prompts do agente de imagem (Gemini "Nano Banana"). Em inglês porque os
 * modelos de imagem respondem melhor a instruções em inglês. Regra de ouro:
 * o produto é preservado; só o fundo muda.
 */
export const IMAGE_KEEP =
  'Preserve the product EXACTLY: same shape, colors, proportions, and all text, ' +
  'logos and labels — do not redraw, restyle, add or remove anything on the product ' +
  'itself. Only the background changes. Center the product, add a realistic soft ' +
  'shadow, even studio lighting, true-to-life colors and sharp focus. Square 1:1, ' +
  'high-resolution, professional e-commerce packshot.';

export const IMAGE_PROMPTS: { key: string; prompt: string }[] = [
  {
    key: 'shopee-1',
    prompt: `Cut the product out from its original cluttered background and place it on a pure solid white background (#FFFFFF), like an official marketplace main photo. ${IMAGE_KEEP}`,
  },
  {
    key: 'shopee-2',
    prompt: `Cut the product out and place it on a clean, minimal light-gray studio backdrop with a soft top-down gradient and a subtle reflection beneath it. ${IMAGE_KEEP}`,
  },
  {
    key: 'shopee-3',
    prompt: `Cut the product out and place it on an elegant, softly-lit neutral surface with tasteful, uncluttered styling that fits a premium listing; keep it minimal so the product stays the hero. ${IMAGE_KEEP}`,
  },
];
