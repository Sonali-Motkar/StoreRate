import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/StoreRate/' : '/',
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
});
