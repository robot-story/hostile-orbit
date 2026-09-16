import { defineConfig } from 'vite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  base: './',
  // Dropbox can lock Vite's atomic dependency-cache renames mid-sync.
  cacheDir: join(tmpdir(), 'hostile-orbit-vite-mk3'),
  server: { port: 5173, strictPort: true, host: true },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: 0,
    emptyOutDir: false, // Dropbox locks directories mid-sync; tools/clean-dist.mjs clears the hashed bundles instead
  },
});
