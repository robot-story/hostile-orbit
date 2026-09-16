import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: true, host: true },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: 0,
    emptyOutDir: false, // Dropbox locks directories mid-sync; tools/clean-dist.mjs clears the hashed bundles instead
  },
});
