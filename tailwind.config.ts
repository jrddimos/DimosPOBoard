import type { Config } from 'tailwindcss'

// Les tokens sémantiques pointent vers des variables CSS (canaux RGB)
// définies dans index.css — elles changent de valeur en mode sombre.
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy:   v('--c-ink'),      // texte principal (bascule en clair la nuit)
        brand:  v('--c-brand'),    // aplats de marque (boutons primaires, en-têtes)
        card:   v('--c-card'),     // surface des cartes / panneaux
        page:   v('--c-page'),     // fond de page derrière le contenu
        subtle: v('--c-subtle'),
        border: v('--c-border'),
        bg:     v('--c-bg'),
        purple: '#4A4CC8',
        'purple-light': '#6B6BF0',
        green:  '#00C896',
        orange: '#F0A500',
        red:    '#EF4444',
        blue:   '#0055CC',
        // Stops re-câblés : teintes (50/100/200) et textes colorés (600/700)
        // s'inversent en mode sombre ; les stops 300-500 et 800+ restent fixes
        // car ils servent aussi de surfaces dans les thèmes sombres de la sidebar.
        slate: {
          50:  v('--tw-slate-50'),  100: v('--tw-slate-100'), 200: v('--tw-slate-200'),
          500: v('--tw-slate-500'), 600: v('--tw-slate-600'),
        },
        indigo: {
          50:  v('--tw-indigo-50'),  100: v('--tw-indigo-100'), 200: v('--tw-indigo-200'),
          600: v('--tw-indigo-600'), 700: v('--tw-indigo-700'),
        },
        emerald: {
          50:  v('--tw-emerald-50'),  100: v('--tw-emerald-100'), 200: v('--tw-emerald-200'),
          600: v('--tw-emerald-600'), 700: v('--tw-emerald-700'),
        },
        amber: {
          50:  v('--tw-amber-50'),  100: v('--tw-amber-100'), 200: v('--tw-amber-200'),
          600: v('--tw-amber-600'), 700: v('--tw-amber-700'),
        },
        rose: {
          50:  v('--tw-rose-50'),  100: v('--tw-rose-100'), 200: v('--tw-rose-200'),
          600: v('--tw-rose-600'), 700: v('--tw-rose-700'),
        },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      boxShadow: {
        card: '0 2px 8px rgba(74,76,200,0.08)',
        modal: '0 20px 60px rgba(0,0,0,0.25)',
      },
    },
  },
  plugins: [],
} satisfies Config
