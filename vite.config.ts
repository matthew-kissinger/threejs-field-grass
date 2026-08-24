import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: {
        index: resolve(import.meta.dirname, 'src/index.ts'),
        react: resolve(import.meta.dirname, 'src/react.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: ['three', 'three/webgpu', 'three/tsl', 'react', '@react-three/fiber'],
    },
    sourcemap: false,
    emptyOutDir: true,
  },
});
