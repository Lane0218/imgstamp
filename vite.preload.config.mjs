import { defineConfig } from 'vite';
import path from 'node:path';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    outDir: 'dist/preload',
    emptyOutDir: true,
    ssr: path.resolve('src/main/preload.ts'),
    rollupOptions: {
      external: ['electron'],
      output: {
        format: 'cjs',
        entryFileNames: 'preload.js',
      },
    },
  },
  ssr: {
    target: 'node18',
  },
});
