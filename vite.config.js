import { defineConfig } from 'vite';
import { resolve } from 'path';
export default defineConfig({
    build: {
        target: 'esnext',
        rollupOptions: {
            input: {
                'service-worker': resolve(import.meta.dirname, 'src/service-worker/index.ts'),
                'content-script': resolve(import.meta.dirname, 'src/content-script/index.ts'),
                'auth-callback': resolve(import.meta.dirname, 'src/auth-callback/index.ts'),
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
});
