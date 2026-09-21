import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";

/**
 * sitemap.xml 的 <lastmod> 注入。
 *
 * public/ 下的文件会被原样拷进 dist/，所以写死在 XML 里的日期会一眼就是旧的
 * （搜索引擎看到 lastmod 长期不变，会降低重抓频率）。
 * 这里在构建结束时把 __LASTMOD__ 换成真实构建日期；dev 下由中间件即时替换，
 * 保证本地看到的也是合理值而不是占位符。
 *
 * 用 YYYY-MM-DD（W3C datetime 的日期精度）而不是完整时间戳：图库是以「天」
 * 为粒度更新，精确到秒反而会让每次构建都产生一次「内容变了」的假信号。
 */
function sitemapLastmod(): Plugin {
  const stamp = () => new Date().toISOString().slice(0, 10);
  return {
    name: "sitemap-lastmod",
    apply: () => true,
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || "").split("?")[0];
        if (url !== "/sitemap.xml") return next();
        const file = path.resolve(__dirname, "public/sitemap.xml");
        if (!fs.existsSync(file)) return next();
        res.setHeader("content-type", "application/xml; charset=utf-8");
        res.end(fs.readFileSync(file, "utf8").replaceAll("__LASTMOD__", stamp()));
      });
    },
    closeBundle() {
      const out = path.resolve(__dirname, "dist/sitemap.xml");
      if (!fs.existsSync(out)) return;
      const next = fs.readFileSync(out, "utf8").replaceAll("__LASTMOD__", stamp());
      fs.writeFileSync(out, next);
    },
  };
}

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
  plugins: [tailwindcss(), react(), sitemapLastmod()],
  // 生产构建剔除 console/debugger。必须放顶层 `esbuild`——Vite 不读
  // `build.esbuildOptions`，之前那份写在 build 里等于没生效。
  esbuild:
    mode === 'production'
      ? {
          drop: ['console', 'debugger'],
          legalComments: 'none',
        }
      : {},
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
          // 注意：不要把 @radix-ui 整体钉成单一 chunk——那会让所有路由
          // 都 eager 加载 Select/AlertDialog/Tabs 等只属于 lazy 页的组件。
          // 交给 rollup 按动态导入边界自动切分（共享部分自然成公共 chunk）。
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
