import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  plugins: [pluginReact()],
  html: { template: './src/static/index.html' },
  server: { port: 5173, strictPort: true },
  environments: {
    web: {
      output: {
        distPath: { root: 'dist/client' },
        copy: [{ from: 'pwa', to: 'static/pwa', globOptions: { ignore: ['**/service-worker.js'] } }],
      },
    },
    node: {
      source: { entry: { index: './src/render/index.tsx' } },
      output: { target: 'node', distPath: { root: 'dist/render' } },
    },
  },
});
