/// <reference types="vitest/config" />
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Component tests only. The e2e/ project owns real-browser coverage.
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
    // clearMocks wipes call history between tests — without it a `not.toHaveBeenCalled`
    // assertion sees the previous test's calls. restoreMocks alone does not cover the
    // vi.fn()s created inside a vi.mock factory.
    clearMocks: true,
    restoreMocks: true,
  },
})
