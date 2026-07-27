import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // pdfjs-dist ships a worker that Vite needs to leave alone during dep optimization.
  optimizeDeps: {
    exclude: ['pdfjs-dist'],
  },
  build: {
    // Schedule B data and the carrier templates are fetched at runtime from /public,
    // so they stay out of the JS bundle entirely.
    chunkSizeWarningLimit: 1200,
  },
})
