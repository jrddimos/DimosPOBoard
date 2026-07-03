import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy:   '#1E3A5F',
        purple: '#4A4CC8',
        'purple-light': '#6B6BF0',
        green:  '#00C896',
        orange: '#F0A500',
        red:    '#EF4444',
        blue:   '#0055CC',
        subtle: '#6B6B8A',
        border: '#E2E2F0',
        bg:     '#F8F9FF',
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
