import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // testFixtures.ts is dev/test-only wiring for the Playwright harness,
      // exercised end-to-end rather than via unit tests.
      include: ['src/gameReducer.ts'],
    },
  },
})
