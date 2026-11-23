import { defineConfig } from 'vite';

// Relative base so the build works at https://shiroonigami23-ui.github.io/Chess-Algorithms/
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
});
