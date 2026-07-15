import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatBRL(value?: number | null): string {
  if (value == null) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatPercent(value?: number | null): string {
  if (value == null) return '—';
  return `${value.toFixed(0)}%`;
}

interface ProductImages {
  thumbnail?: string;
  hd?: string;
  square?: string;
  webp?: string;
  shopee?: string[];
  original?: string;
}

/** Miniatura de listagem: nunca cai pra foto original (sem recorte/tratamento). */
export function productThumbnail(images?: ProductImages | null): string | undefined {
  return images?.thumbnail;
}

/** Galeria de imagens tratadas do produto — a foto original nunca aparece aqui. */
export function productGallery(images?: ProductImages | null): string[] {
  const list = images?.shopee?.length ? images.shopee : [images?.hd, images?.square, images?.webp];
  return list.filter(Boolean) as string[];
}
