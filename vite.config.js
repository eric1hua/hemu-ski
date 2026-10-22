import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { mapEditorSaves } from './tools/map-editor/vite-plugin.js';

// Two pages ship: the snowboarding game and the tabletop diorama. The tools in
// tools/ (the map editor, the review pages) are dev-only and stay out of the build.
export default defineConfig({
  // Relative URLs, so the build works under any sub-path (GitHub Pages serves it at /hemu-ski/).
  base: './',
  // The map editor saves its edits through the dev server.
  plugins: [mapEditorSaves()],
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        diorama: fileURLToPath(new URL('diorama.html', import.meta.url)),
      },
    },
  },
});
