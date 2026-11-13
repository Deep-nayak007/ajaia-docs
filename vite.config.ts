import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  // The editor (ProseMirror + TipTap) is most of the bundle; ~215 kB gzipped is fine here.
  build: { outDir: '../dist/client', emptyOutDir: true, chunkSizeWarningLimit: 800 },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
});
