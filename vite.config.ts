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
    // 开启 CSS 代码分割
    cssCodeSplit: true,
    // 目标环境：支持现代浏览器
    target: mode === 'production' ? ['es2020', 'chrome87', 'firefox78', 'safari14'] : 'esnext',
    // 启用 minify
    minify: mode === 'production' ? 'esbuild' : false,
    // esbuild 压缩选项
    esbuildOptions: mode === 'production' ? {
      drop: ['console', 'debugger'],
      legalComments: 'none',
    } : {},
    rollupOptions: {
      output: {
        // 优化代码分割策略
        manualChunks: (id: string) => {
          // React 核心
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react-vendor';
          }
          // 图表库（仅在用到时加载）
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) {
            return 'chart-vendor';
          }
          // Radix UI 组件库
          if (id.includes('node_modules/@radix-ui/')) {
            return 'ui-vendor';
          }
          // React Query
          if (id.includes('node_modules/@tanstack/')) {
            return 'query-vendor';
          }
          // Lucide 图标（按需分包）
          if (id.includes('node_modules/lucide-react')) {
            return 'icons-vendor';
          }
        },
        // 优化入口 chunk 文件名
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name ?? '';
          // CSS 文件
          if (name.endsWith('.css')) return 'assets/css/[name]-[hash][extname]';
          // 字体文件
          if (/\.(woff2?|ttf|eot)$/.test(name)) return 'assets/fonts/[name]-[hash][extname]';
          // 图片文件
          if (/\.(png|jpe?g|gif|svg|webp|avif|ico)$/.test(name)) return 'assets/images/[name]-[hash][extname]';
          return 'assets/[name]-[hash][extname]';
        },
      },
      treeshake: true,
    },
    // 放宽 chunk 大小警告阈值（大部分包已被合理分割）
    chunkSizeWarningLimit: 500,
    // 生产构建时报告详细大小
    reportCompressedSize: mode === 'production',
    // 禁用 sourcemap（生产环境提升性能）
    sourcemap: mode !== 'production',
  },
}));
