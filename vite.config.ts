import { defineConfig, type Plugin } from 'vite';

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

export default defineConfig({
  base: './',
  server: { host: true },
  plugins: [lanUrls()],
});
