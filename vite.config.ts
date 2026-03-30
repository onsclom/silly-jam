import { defineConfig } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ViteImageOptimizer } from "vite-plugin-image-optimizer";

const dir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Use relative asset URLs so dist can run from file:// or nested paths.
  base: "./",
  build: {
    modulePreload: {
      polyfill: false,
    },
    rolldownOptions: {
      input: {
        main: resolve(dir, "index.html"),
      },
    },
  },
  plugins: [ViteImageOptimizer()],
  resolve: {
    tsconfigPaths: true,
  },
});
