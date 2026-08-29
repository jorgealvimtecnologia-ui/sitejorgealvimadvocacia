import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  root: './',
  publicDir: 'public',
  server: {
    host: true,
    port: 3000,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
