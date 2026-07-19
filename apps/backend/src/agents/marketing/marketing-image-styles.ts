/**
 * Estilos de imagem do Marketing IA (Agente 4 — Image). Mesma engine do
 * `ImageAgent` (Gemini "Nano Banana" via `GeminiImageClient`), prompts de
 * cena diferentes — cobre os estilos pedidos que ainda não existem em
 * `agents/prompts.ts` (fundo branco e "pessoa usando" já são cobertos pelas
 * fotos `shopee-1`/`shopee-4` do catálogo, não duplicados aqui).
 */

const KEEP =
  'Preserve the product EXACTLY: same shape, colors, proportions, and all text, logos and ' +
  'labels — do not redraw, restyle, add or remove anything on the product itself.';

export interface MarketingImageStyle {
  key: string;
  label: string;
  prompt: string;
  format: 'square' | 'vertical' | 'horizontal';
  transparentBackground?: boolean;
}

export const MARKETING_IMAGE_STYLES: MarketingImageStyle[] = [
  {
    key: 'premium',
    label: 'Premium',
    format: 'square',
    prompt: `Place the product on an elegant, softly-lit dark or neutral premium surface with subtle reflections and cinematic lighting, like a luxury product ad. ${KEEP}`,
  },
  {
    key: 'lifestyle',
    label: 'Lifestyle',
    format: 'square',
    prompt: `Show the product in a natural, photorealistic everyday lifestyle scene, in active real-world use by a person, well-lit and high-resolution. ${KEEP}`,
  },
  {
    key: 'desk',
    label: 'Mesa / Escritório',
    format: 'square',
    prompt: `Place the product on a modern wooden desk in a bright home-office setting, with tasteful props (laptop, plant, notebook) softly out of focus in the background. ${KEEP}`,
  },
  {
    key: 'gamer',
    label: 'Gamer',
    format: 'square',
    prompt: `Place the product in a moody gamer setup scene with RGB ambient lighting (purple/blue neon tones), a keyboard and monitor softly blurred in the background. ${KEEP}`,
  },
  {
    key: 'modern_room',
    label: 'Ambiente moderno',
    format: 'square',
    prompt: `Place the product in a bright, minimalist modern living room with neutral tones and natural light. ${KEEP}`,
  },
  {
    key: 'minimalist',
    label: 'Minimalista',
    format: 'square',
    prompt: `Place the product alone on a plain, extremely minimal pastel background with lots of negative space, soft shadow, high-end minimal aesthetic. ${KEEP}`,
  },
  {
    key: 'apple_style',
    label: 'Apple style',
    format: 'square',
    prompt: `Place the product centered on a pure bright white to very light gray gradient background, ultra-clean studio lighting, sharp reflections, in the style of premium tech product photography. ${KEEP}`,
  },
  {
    key: 'samsung_style',
    label: 'Samsung style',
    format: 'square',
    prompt: `Place the product on a bold gradient background (deep blue to violet), dynamic angled lighting with vibrant highlights, energetic modern tech-ad style. ${KEEP}`,
  },
  {
    key: 'transparent',
    label: 'Fundo transparente',
    format: 'square',
    transparentBackground: true,
    prompt: `Cut the product out precisely with a clean transparent background (alpha channel), no shadow, ready for compositing. ${KEEP}`,
  },
  {
    key: 'banner',
    label: 'Banner promocional',
    format: 'horizontal',
    prompt: `Place the product to one side of a wide horizontal banner composition with clean empty copy space on the other side for text overlay, professional e-commerce promotional banner style. ${KEEP}`,
  },
  {
    key: 'black_friday',
    label: 'Black Friday',
    format: 'square',
    prompt: `Place the product on a bold dark background with dramatic red and black sale-themed lighting accents, high-contrast dynamic promotional mood. ${KEEP}`,
  },
  {
    key: 'christmas',
    label: 'Natal',
    format: 'square',
    prompt: `Place the product in a warm, festive Christmas-themed scene with soft bokeh string lights, pine branches and red/gold accents in the background, tasteful and uncluttered. ${KEEP}`,
  },
  {
    key: 'offer',
    label: 'Oferta',
    format: 'square',
    prompt: `Place the product on a vibrant, energetic background with soft dynamic light bursts suggesting a special offer, clean and uncluttered so the product stays the hero. ${KEEP}`,
  },
];
