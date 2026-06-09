import { defineConfig, type Plugin } from 'vite'
import { resolve } from 'path'
import { copyFileSync, existsSync, rmSync } from 'fs'

function firefoxManifestPlugin(): Plugin {
  return {
    name: 'firefox-manifest',
    closeBundle() {
      const outDir = resolve(import.meta.dirname, 'dist-firefox')
      const src = resolve(import.meta.dirname, 'public', 'manifest.firefox.json')
      const dest = resolve(outDir, 'manifest.json')
      const stale = resolve(outDir, 'manifest.firefox.json')
      copyFileSync(src, dest)
      if (existsSync(stale)) rmSync(stale)
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
