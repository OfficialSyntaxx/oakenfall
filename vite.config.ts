import { defineConfig } from 'vite';

// Vite build for the game.
//
// Note on asset paths: our game art lives in public/assets/ and is referenced at
// runtime as relative "assets/<group>/<file>". Vite's own bundle output also
// defaults to an "assets" directory, which would collide — so the bundle is
// emitted to "bundle/" instead and public/assets passes through untouched.
//
// base:'./' keeps every URL relative, which matters because the game is served
// from /game/ on the web and from a file-like scheme inside a Capacitor app.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'bundle',
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: {
        entryFileNames: 'bundle/[name]-[hash].js',
        chunkFileNames: 'bundle/[name]-[hash].js',
        assetFileNames: 'bundle/[name]-[hash][extname]',
      },
    },
  },
});
