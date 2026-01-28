import { defineConfig } from 'vite';
import path from 'node:path';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    outDir: 'dist/main',
    emptyOutDir: true,
    ssr: path.resolve('src/main/main.ts'),
    rollupOptions: {
      external: ['electron', 'sharp'],
      output: {
        format: 'cjs',
        entryFileNames: 'main.js',
      },
    },
  },
  ssr: {
    target: 'node18',
  },
});
