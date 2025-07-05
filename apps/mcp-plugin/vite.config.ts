import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/mcp_socketio_plugin.ts'),
      formats: ['iife'],
      name: 'BlockbenchMcpPlugin',
      fileName: () => 'mcp_socketio_plugin.js'
    },
    outDir: 'dist',
    emptyOutDir: true
  }
});
