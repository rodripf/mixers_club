import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        'service-worker': resolve(__dirname, 'src/service-worker/index.ts'),
        'content-script': resolve(__dirname, 'src/content-script/index.ts'),
        'popup': resolve(__dirname, 'src/popup/index.ts'),
        'auth-callback': resolve(__dirname, 'src/auth-callback/index.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        format: 'es',
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
    copyPublicDir: true,
  },
})
