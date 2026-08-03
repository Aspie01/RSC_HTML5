import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so `npm run build` output still runs by
  // double-clicking dist/index.html -- no server required to play the build.
  base: './',

  server: {
    port: 5173
  },

  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: true
  }
});
