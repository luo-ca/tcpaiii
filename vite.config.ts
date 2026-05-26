import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const apiProxyTarget = process.env.API_PROXY_TARGET;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 5173,
    hmr: {
      overlay: false,
    },
    ...(apiProxyTarget
      ? {
          proxy: {
            "/api": {
              target: apiProxyTarget,
              changeOrigin: true,
            },
          },
        }
      : {}),
  },
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'chart-vendor': ['recharts', 'd3-scale', 'd3-shape', 'd3-array'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-tabs', '@radix-ui/react-select', '@radix-ui/react-label', '@radix-ui/react-slot', '@radix-ui/react-alert-dialog'],
          'query-vendor': ['@tanstack/react-query'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
}));
