import { resolve } from 'path';
import { defineConfig } from 'vite';

const root = resolve(__dirname, 'public');

export default defineConfig({
  root,
  // .env lives at the repo root, next to this file.
  envDir: __dirname,
  // Expose the existing .env names to import.meta.env without a VITE_ prefix.
  envPrefix: ['FIREBASE_', 'TMDB_'],
  publicDir: false,
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(root, 'index.html'),
        homepage: resolve(root, 'homepage.html'),
        404: resolve(root, '404.html')
      }
    }
  }
});
