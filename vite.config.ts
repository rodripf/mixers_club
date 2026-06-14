import { defineConfig, type Plugin } from 'vite'
import { resolve } from 'path'
import { copyFileSync, existsSync, mkdirSync } from 'fs'

function firefoxManifestPlugin(): Plugin {
  return {
    name: 'firefox-manifest',
    closeBundle() {
      const outDir = resolve(import.meta.dirname, 'dist-firefox')
      const configDir = resolve(import.meta.dirname, 'config')
      mkdirSync(outDir, { recursive: true })

      const manifestSrc = resolve(configDir, 'manifest.firefox.json')
      if (!existsSync(manifestSrc)) throw new Error(`Firefox manifest not found: ${manifestSrc}`)
      copyFileSync(manifestSrc, resolve(outDir, 'manifest.json'))

      const bgSrc = resolve(configDir, 'background.html')
      if (!existsSync(bgSrc)) throw new Error(`Firefox background.html not found: ${bgSrc}`)
      copyFileSync(bgSrc, resolve(outDir, 'background.html'))
    },
  }
}

export default defineConfig(({ mode }) => {
  const isFirefox = mode === 'firefox'

  return {
    build: {
      target: 'esnext',
      rollupOptions: {
        input: {
          'service-worker': resolve(import.meta.dirname, 'src/service-worker/index.ts'),
          'content-script': resolve(import.meta.dirname, 'src/content-script/index.ts'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name]-[hash].js',
          format: 'es',
        },
      },
      outDir: isFirefox ? 'dist-firefox' : 'dist',
      emptyOutDir: true,
      copyPublicDir: true,
    },
    plugins: isFirefox ? [firefoxManifestPlugin()] : [],
  }
})
