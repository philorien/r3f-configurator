import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
// Served from a project page at /r3f-configurator/ on GitHub Pages.
export default defineConfig({
  base: '/r3f-configurator/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
  build: {
    // three.js alone is ~700 kB minified. It's lazy-loaded and cached separately from app code,
    // so raise the warning threshold just past it instead of hiding the check entirely.
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }],
        },
      },
    },
  },
})
