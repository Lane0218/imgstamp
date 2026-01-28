import { defineConfig } from 'vite';
import path from 'node:path';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    conditions: ['node'],
  },
  build: {
    outDir: 'dist/main',
    emptyOutDir: true,
    ssr: path.resolve('src/main/main.ts'),
    target: 'node20',
    rollupOptions: {
      external: ['electron', 'sharp'],
      output: {
        entryFileNames: 'main.js',
        format: 'cjs',
      },
    },
  },
});
