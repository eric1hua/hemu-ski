import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Two pages: the snowboarding game and the tabletop diorama.
export default defineConfig({
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
