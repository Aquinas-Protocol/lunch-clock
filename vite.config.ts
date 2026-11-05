import { defineConfig } from 'vite';

// Served from GitHub Pages at https://aquinas-protocol.github.io/lunch-clock/
export default defineConfig({
  base: '/lunch-clock/',
  build: { target: 'es2022' },
});
