import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { serviceWorker } from './vite-sw.ts';

/**
 * Dev and preview only: `/__lan` answers with the server's network URLs, so the
 * "Play on your phone" QR code can point at this computer instead of localhost.
 */
const lanUrls = (): Plugin => ({
  name: 'lan-urls',
  configureServer(server) {
    server.middlewares.use('/__lan', (_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(server.resolvedUrls?.network ?? []));
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use('/__lan', (_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(server.resolvedUrls?.network ?? []));
    });
  },
});

/** The game's version, shown on the title screen (bump it with `npm version` before pushing). */
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { host: true },
  plugins: [lanUrls(), serviceWorker()],
});
