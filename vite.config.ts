import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'child_process'

const version = execSync('git describe --tags --always --dirty').toString().trim()

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  define: {
    'import.meta.env.VITE_BUILD_VERSION': JSON.stringify(version)
  }
})
