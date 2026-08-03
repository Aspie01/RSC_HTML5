import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths. Required for itch.io, which serves the game from a
  // subpath -- absolute paths are the top cause of a blank page after upload.
  //
  // Relative paths alone do NOT make the build double-clickable: Vite marks
  // its tags `crossorigin`, and `type="module"` is CORS-fetched regardless, so
  // over file:// both are refused. `tools/inline.mjs` runs after the build and
  // folds everything into index.html, which is what actually fixes it.
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
