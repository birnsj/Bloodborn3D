import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { levelFileApiPlugin } from './vite-plugins/levelFileApi.js';
import { assetFileApiPlugin } from './vite-plugins/assetFileApi.js';
import { openArtApiPlugin } from './vite-plugins/openArtApi.js';
import { conceptLibraryApiPlugin } from './vite-plugins/conceptLibraryApi.js';

export default defineConfig({
  plugins: [
    react(),
    levelFileApiPlugin(),
    assetFileApiPlugin(),
    openArtApiPlugin(),
    conceptLibraryApiPlugin(),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
  server: {
    port: 5173,
  },
});
