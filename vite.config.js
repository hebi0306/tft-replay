import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  // Keep builds repeatable in environments that restrict directory deletion.
  build: { emptyOutDir: false },
});
