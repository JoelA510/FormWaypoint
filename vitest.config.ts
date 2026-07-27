import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // The domain layer is pure TypeScript with no DOM dependency; the PDF parser runs
    // against pdfjs' Node build. Tests that need a DOM opt in per-file with
    // `// @vitest-environment jsdom`.
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    testTimeout: 30_000,
  },
})
