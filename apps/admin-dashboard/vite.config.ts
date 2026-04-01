import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/admin': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
