import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig(({ mode }) => {
  const file = mode === 'development' ? 'config.dev.json' : 'config.json'
  const config = JSON.parse(readFileSync(new URL(`./${file}`, import.meta.url), 'utf8'))

  return {
    plugins: [preact()],
    base: './',
    define: { __WD_CONFIG__: JSON.stringify(config) },
    server: { host: true, port: 5173 },
    build: { outDir: 'dist', emptyOutDir: true, target: 'es2020' },
  }
})
