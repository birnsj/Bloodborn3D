import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { levelFileApiPlugin } from './vite-plugins/levelFileApi.js';
import { assetFileApiPlugin } from './vite-plugins/assetFileApi.js';

export default defineConfig({
  plugins: [react(), levelFileApiPlugin(), assetFileApiPlugin()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
  server: {
    port: 5173,
  },
});
