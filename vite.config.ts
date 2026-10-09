import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

const PACKAGE = fileURLToPath(new URL('./package.json', import.meta.url));
const readVersion = () => (JSON.parse(readFileSync(PACKAGE, 'utf8')) as { version: string }).version;

/** The game's version, shown on the title screen (bump it with `npm version` before pushing). */
const version = readVersion();

/**
 * Dev only: the version is baked in when the server starts, so a bump (`npm version`)
 * restarts the server and the page reloads showing the new one.
 */
const versionReload = (): Plugin => ({
  name: 'version-reload',
  configureServer(server) {
    server.watcher.add(PACKAGE);
    server.watcher.on('change', (file) => {
      if (file !== PACKAGE || readVersion() === version) return;
      server.config.logger.info(`version ${version} → ${readVersion()}: restarting`, { timestamp: true });
      server.restart();
    });
  },
});

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { host: true },
  plugins: [lanUrls(), versionReload(), serviceWorker()],
});
