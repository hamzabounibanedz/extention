import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const repoRoot = path.resolve(__dirname, '../..');
  const fileEnv = loadEnv(mode, repoRoot, '');
  const adminProxyTarget =
    process.env.ADMIN_DASHBOARD_PROXY_TARGET ||
    fileEnv.ADMIN_DASHBOARD_PROXY_TARGET ||
    'http://127.0.0.1:3000';

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/admin': { target: adminProxyTarget, changeOrigin: true },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
