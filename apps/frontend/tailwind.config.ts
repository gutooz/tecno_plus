import type { Config } from 'tailwindcss';

/**
 * Design System — Tecno Plus.
 * Inspirado em Apple HIG / iOS / Linear / Stripe: raios generosos, tipografia
 * Geist, elevação em camadas suaves, motion com easing Apple. Cores vêm de CSS
 * variables (globals.css) para dark/light corretos.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--surface-3) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        'border-strong': 'rgb(var(--border-strong) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        faint: 'rgb(var(--faint) / <alpha-value>)',
        primary: 'rgb(var(--primary) / <alpha-value>)',
        'primary-fg': 'rgb(var(--primary-fg) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
      },
      ringColor: {
        DEFAULT: 'rgb(var(--ring) / 0.45)',
      },
      borderRadius: {
        lg: '0.625rem', // 10px — elementos pequenos inline
        xl: '0.875rem', // 14px — inputs, botões não-pill
        '2xl': '1rem', // 16px — containers de ícone, painéis médios
        '3xl': '1.25rem', // 20px — cards
        '4xl': '1.5rem', // 24px — superfícies grandes, modais, login
      },
      boxShadow: {
        // Camadas suaves — nunca sombras pesadas
        xs: '0 1px 2px rgb(var(--shadow-color) / 0.04)',
        soft: '0 1px 2px rgb(var(--shadow-color) / 0.04), 0 4px 14px rgb(var(--shadow-color) / 0.05)',
        md: '0 2px 4px rgb(var(--shadow-color) / 0.04), 0 8px 22px rgb(var(--shadow-color) / 0.06)',
        lg: '0 4px 8px rgb(var(--shadow-color) / 0.05), 0 16px 34px rgb(var(--shadow-color) / 0.08)',
        glass: '0 8px 40px rgb(var(--shadow-color) / 0.12)',
        'primary-glow': '0 6px 20px rgb(var(--primary) / 0.28)',
      },
      backdropBlur: {
        xs: '2px',
        DEFAULT: '10px',
        md: '16px',
        lg: '24px',
      },
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.32, 0.72, 0, 1)',
        'out-soft': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      transitionDuration: {
        250: '250ms',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out both',
        'fade-up': 'fade-up 0.35s cubic-bezier(0.22, 1, 0.36, 1) both',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};

export default config;
