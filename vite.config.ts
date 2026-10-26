import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// Served from a project page at /r3f-configurator/ on GitHub Pages.
export default defineConfig({
  base: '/r3f-configurator/',
  plugins: [react()],
})
