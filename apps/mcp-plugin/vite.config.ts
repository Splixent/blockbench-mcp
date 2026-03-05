import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';

function getConfiguredLang(): string {
  const configPath = resolve(__dirname, '../../.langrc.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      return config.lang || 'en';
    } catch {
      return 'en';
    }
  }
  return 'en';
}

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../../packages/shared/src'),
    },
  },
  define: {
    __LANG__: JSON.stringify(getConfiguredLang()),
  },
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
