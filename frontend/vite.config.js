import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  envDir: root,
  plugins: [react()],
  // Keep builds repeatable in environments that restrict directory deletion.
  build: { outDir: resolve(root, '..', 'dist'), emptyOutDir: false },
});
