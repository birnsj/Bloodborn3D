import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { levelFileApiPlugin } from './vite-plugins/levelFileApi.js';
import { assetFileApiPlugin } from './vite-plugins/assetFileApi.js';
import { openArtApiPlugin } from './vite-plugins/openArtApi.js';
import { meshyApiPlugin } from './vite-plugins/meshyApi.js';
import { conceptLibraryApiPlugin } from './vite-plugins/conceptLibraryApi.js';
import { projectArtApiPlugin } from './vite-plugins/projectArtApi.js';
import { googleDriveApiPlugin } from './vite-plugins/googleDriveApi.js';
import { stickyNotesApiPlugin } from './vite-plugins/stickyNotesApi.js';
import { checklistsApiPlugin } from './vite-plugins/checklistsApi.js';
import { charactersApiPlugin } from './vite-plugins/charactersApi.js';

export default defineConfig({
  plugins: [
    react(),
    levelFileApiPlugin(),
    assetFileApiPlugin(),
    openArtApiPlugin(),
    meshyApiPlugin(),
    conceptLibraryApiPlugin(),
    projectArtApiPlugin(),
    googleDriveApiPlugin(),
    stickyNotesApiPlugin(),
    checklistsApiPlugin(),
    charactersApiPlugin(),
  ],
  build: {
    // Two pages: the editor (index.html) and the standalone player (player.html).
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        player: fileURLToPath(new URL('./player.html', import.meta.url)),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
