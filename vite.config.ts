import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import vesaErrorReporter from "./.vesa/vite-error-plugin.js";
import vesaDesignMode from "./.vesa/vite-design-mode-plugin.js";
import path from "path";
import fs from "fs";

const hasEsaConfig = fs.existsSync(path.resolve(__dirname, "esa.jsonc"));

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 5173,
    hmr: {
      overlay: false,
    },
    ...(hasEsaConfig
      ? {
          proxy: {
            "/api": {
              target: "http://127.0.0.1:18080",
              changeOrigin: true,
            },
          },
        }
      : {}),
  },
  plugins: [vesaErrorReporter(), vesaDesignMode(), tailwindcss(), react()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
