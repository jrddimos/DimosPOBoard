/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  // react-draggable (dépendance de react-grid-layout) référence
  // `process.env.DRAGGABLE_DEBUG` sans garde — `process` n'existe pas dans le
  // navigateur, ce qui lève une ReferenceError en plein milieu d'un drag/resize
  // et interrompt le geste silencieusement (carte figée). On remplace
  // `process.env` par un objet vide au build/dev pour neutraliser la référence.
  define: {
    'process.env': {},
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
