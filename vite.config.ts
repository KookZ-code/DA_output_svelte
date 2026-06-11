import os from 'node:os';
import { sveltekit } from '@sveltejs/kit/vite';
import type { PluginOption } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Print "Hostname: http://<computer-name>:<port><base>/" alongside Vite's
 * default Local/Network URLs so users can be given a stable URL that
 * survives DHCP IP changes.
 */
const printHostname: PluginOption = {
  name: 'print-hostname-url',
  configureServer(server) {
    const original = server.printUrls.bind(server);
    server.printUrls = () => {
      original();
      const protocol = server.config.server.https ? 'https' : 'http';
      const port = server.config.server.port ?? 5173;
      const base = server.config.base || '/';
      const hostname = os.hostname().toLowerCase();
      // Match Vite's ANSI styling: green arrow + bold label + cyan URL
      console.log(
        `  \x1b[32m➜\x1b[39m  \x1b[1mHostname\x1b[22m: \x1b[36m${protocol}://${hostname}:${port}${base}\x1b[39m`
      );
    };
  },
};

export default defineConfig({
  plugins: [sveltekit(), printHostname],
  server: {
    port: 5173,
    // Allow access via computer name / any hostname.
    // Vite 6 defaults to localhost-only and returns 403 for other Host headers,
    // which breaks LAN access using a stable computer name. Internal-network
    // dev only — production runs behind IIS so this setting has no effect.
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
  },
});
