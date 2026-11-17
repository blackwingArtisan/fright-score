import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 3120, strictPort: true },
  preview: { port: 3121, strictPort: true },
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true },
});
