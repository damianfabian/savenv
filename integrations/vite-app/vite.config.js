import { defineConfig } from 'vite';
import hidevars from 'hidevars/vite';

export default defineConfig({
  plugins: [hidevars()],
  build: {
    minify: false,
    sourcemap: false,
  },
});
