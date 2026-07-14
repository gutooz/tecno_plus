import type { Transition, Variants } from 'framer-motion';

/**
 * Presets de motion compartilhados. Curtos (120–350ms), easing Apple, sutis.
 * Centralizados para consistência — nunca duplicar valores nas telas.
 */

export const easeOutSoft: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const springSoft: Transition = { type: 'spring', stiffness: 420, damping: 34 };

/** Entrada padrão de bloco/página: fade + leve slide-up. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: easeOutSoft } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.25, ease: easeOutSoft } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.97 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.2, ease: easeOutSoft } },
};

/** Container que escalona a entrada dos filhos (listas, grids, formulários). */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.04 },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.34, ease: easeOutSoft } },
};
