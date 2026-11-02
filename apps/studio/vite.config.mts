import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { nxReadySignal } from '@nx/vite/plugins/nx-ready-signal.plugin';
import { artifactGalleryPlugin } from './gallery-server';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/studio',
  server: {
    port: 4200,
    host: 'localhost',
  },
  preview: {
    port: 4300,
    host: 'localhost',
  },
  plugins: [nxReadySignal(), artifactGalleryPlugin()],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [],
  // },
  build: {
    rollupOptions: {
      input: {
        studio: resolve(import.meta.dirname, 'index.html'),
        render: resolve(import.meta.dirname, 'render.html'),
        comparison: resolve(import.meta.dirname, 'comparison.html'),
        workbench: resolve(import.meta.dirname, 'workbench.html'),
        recipeFilm: resolve(import.meta.dirname, 'recipe-film.html'),
        gallery: resolve(import.meta.dirname, 'gallery.html'),
        flowerFilm: resolve(import.meta.dirname, 'flower-film.html'),
        lineBulb: resolve(import.meta.dirname, 'line-bulb.html'),
        expansionFilm: resolve(import.meta.dirname, 'expansion-film.html'),
      },
    },
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
}));
