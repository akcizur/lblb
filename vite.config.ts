import { defineConfig } from 'vite';

export default defineConfig({
  base: '/lblb/',
  server: {
    host: '0.0.0.0',
    port: 4444,
    strictPort: true,
  },
  build: {
    target: 'es2022',
  },
});
