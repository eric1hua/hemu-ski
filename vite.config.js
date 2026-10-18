import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const EDITS_DIR = fileURLToPath(new URL('public/data/edits/', import.meta.url));
const EDIT_FILES = new Set(['edits.json', 'detail.u16']);

// The map editor (/editor.html) saves through the dev server:
//   PUT    /__editor/edits/<file>  writes public/data/edits/<file>
//   DELETE /__editor/edits         removes the folder (back to the baked map)
// The folder is left out of Vite's file watching (so a save doesn't reload the
// open pages), which also keeps it out of Vite's public-file list, so it is
// served from here, fresh from disk, with an empty 204 when there's nothing saved.
function mapEditorSaves() {
  const TYPES = { '.json': 'application/json', '.u16': 'application/octet-stream' };
  return {
    name: 'map-editor-saves',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/data/edits', async (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        const name = decodeURIComponent((req.url || '/').split('?')[0].slice(1));
        if (!EDIT_FILES.has(name)) return next();
        try {
          const body = await fs.readFile(path.join(EDITS_DIR, name));
          res.setHeader('Content-Type', TYPES[path.extname(name)]);
          res.setHeader('Cache-Control', 'no-store');
          res.end(req.method === 'HEAD' ? undefined : body);
        } catch {
          res.statusCode = 204; // nothing saved; quieter in the console than a 404
          res.end();
        }
      });
      server.middlewares.use('/__editor/edits', async (req, res) => {
        try {
          const name = decodeURIComponent((req.url || '/').split('?')[0].slice(1));
          if (req.method === 'PUT' && EDIT_FILES.has(name)) {
            const chunks = [];
            for await (const c of req) chunks.push(c);
            await fs.mkdir(EDITS_DIR, { recursive: true });
            await fs.writeFile(path.join(EDITS_DIR, name), Buffer.concat(chunks));
          } else if (req.method === 'DELETE' && !name) {
            await fs.rm(EDITS_DIR, { recursive: true, force: true });
          } else {
            res.statusCode = 404;
            return res.end();
          }
          res.statusCode = 204;
          res.end();
        } catch (e) {
          res.statusCode = 500;
          res.end(String(e));
        }
      });
    },
  };
}

// Two pages: the snowboarding game and the tabletop diorama. The map editor
// (editor.html) is a dev-only page and stays out of the build.
export default defineConfig({
  // Relative URLs, so the build works under any sub-path (GitHub Pages serves it at /hemu-ski/).
  base: './',
  plugins: [mapEditorSaves()],
  // Saving from the editor shouldn't reload the open pages.
  server: { watch: { ignored: ['**/public/data/edits/**'] } },
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
