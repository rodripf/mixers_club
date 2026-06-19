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

// Supabase Realtime has an optional @opentelemetry/api import guarded by @vite-ignore.
// The package is not installed; replace the dynamic import with Promise.resolve(null)
// so the bundle contains no runtime import() with a variable argument.
function noOtelPlugin(): Plugin {
  const OTEL_IMPORT = `import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ OTEL_PKG).catch(() => null)`
  const NULL_PROMISE = `Promise.resolve(null)`

  return {
    name: 'no-otel',
    transform(code, id) {
      if (!id.includes('@supabase') || !code.includes(OTEL_IMPORT)) return null
      return { code: code.replace(OTEL_IMPORT, NULL_PROMISE), map: null }
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
    plugins: [noOtelPlugin(), ...(isFirefox ? [firefoxManifestPlugin()] : [])],
  }
})
