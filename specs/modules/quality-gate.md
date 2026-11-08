---
id: tcapi-mod-quality-gate
type: module-design
status: active
title: 构建与质量门禁
parent: tcapi-architecture
tags: [tooling, testing, ci]
---

# 构建与质量门禁

`package.json` 的 scripts、`vite.config.ts`、`tsconfig*.json`、`eslint.config.js`、
`scripts/git-hooks/*`、`scripts/check-api.mjs`、`src/test/*`（128 个用例文件）。

## Responsibility

### 构建

| 命令 | 行为 |
| --- | --- |
| `npm run dev` | Vite 开发服务器（`:5173`），`API_PROXY_TARGET` 存在时代理 `/api` |
| `npm run build` | `build:functions`（tsc 编译 `edge-functions-src` → `edge-functions`）+ `vite build` |
| `npm run edgeone:dev` | `edgeone pages dev`：按 `edgeone.json` 起 Vite 并在同端口代理 Functions |
| `npm run check` | `lint` + `typecheck` + `test` + `build` 全套 |

Vite 配置要点：

- 生产构建 `esbuild.drop: ['console','debugger']` 放在**顶层 `esbuild`** ——
  Vite 不读 `build.esbuildOptions`。
- `manualChunks` 只固定 `react-vendor` / `query-vendor` / `icons-vendor`；
  **不**把 `@radix-ui` 整体钉成单一 chunk（那会让所有路由 eager 加载只属于
  lazy 页的 Select/AlertDialog/Tabs）。
- `sitemapLastmod` 插件在 `closeBundle` 与 dev 中间件里把 `public/sitemap.xml`
  的 `__LASTMOD__` 换成构建日期（`YYYY-MM-DD`）。

### 门禁

`pre-commit` 钩子依次跑 `typecheck` → `lint` → `test`（`SKIP_PRECOMMIT=1` 可跳过）。
`npm install` 通过 `prepare` 自动安装钩子（`scripts/git-hooks/install.mjs`）。

为什么是这三项：`build` 用 vite/esbuild **只转译不做类型检查**，`lint` 也没开
type-aware 规则 —— 类型错误只有 `typecheck` 能发现。仓库历史上因此积压过两个
tsc 错误，直到把 typecheck 补进门禁才清零。

### 线上体检

`npm run check:api`（`scripts/check-api.mjs`）对 `API_BASE_URL`（默认生产域名）
逐个打 `/api/stats`、`/api/random?format=json`、`/api/random`（302）、`/api/health`、
`/api/list`、带 tag 的随机重定向。

### 测试

`src/test/*` 共 128 个文件，主要分四类：

1. **行为测试**（后端）：直接驱动 `handler.fetch` 与 `MockEdgeKV`，
   覆盖 CRUD、批量、鉴权、限流、统计、脏数据自愈。
2. **契约一致性**：`constants-parity`（前后端常量逐值比对）、
   `readme-api-parity`（README 与实现）、`edge-functions-sync`（产物与源码逐字节）、
   `deploy-config-consistency`、`site-origin-consistency`。
3. **渲染测试**：`@testing-library` 风格的组件渲染与可访问性断言。
4. **源码扫描**：对 `.tsx` 做字面量提取，验证「错误文案已中文化」「没有重复注释块」
   「没有不可见字符」「设计令牌没有引入新色相」这类结构性约束。

## Boundary

门禁只校验「本地能看出来的问题」，不替代真实浏览器验证。UI 相关断言多为
结构/字面量检查，改类名可能让测试失效 —— 因此关键行为尽量抽成可被真实调用的
纯函数（如 `delete-gate.ts`、`chunk-error.ts`）而不是靠正则断言源码。

## Invariants

1. **`edge-functions/*.js` 必须与源码同步**。它是提交进仓库的编译产物，也是实际
   部署的东西。`edge-functions-sync.test.ts` 现场重编译到临时目录并逐字节比对，
   不一致就红。改 `edge-functions-src` 后必须跑 `npm run build:functions`。
2. **成对常量必须同值**：`constants-parity.test.ts` 从两边源码里解析数值逐对比较。
   漂移的代价是静默行为分裂（前端放行、服务端拒），不是报错。
3. **钩子安装不能静默覆盖用户文件**：`install.mjs` 覆盖前先比对内容，不同则先
   备份成 `.bak-<ts>` 并打印提示。非 git 工作区时跳过而不是失败（`prepare` 在
   打包/CI 环境也会跑）。
4. **`check:api` 必须检查 HTTP 状态码**：只查 content-type 与「是不是 HTML」时，
   `500 + application/json + {"error":...}` 会一路通过、退出码 0 ——
   首页统计整块坏着而体检报绿。
5. **eslint 的 ignores 与 `.gitignore` 对齐**：`.workbuddy`、`.edgeone` 等目录
   内容不受控，参与 lint 会让「lint 通过」不可复现。
6. **Tailwind 扫描排除文档与测试**（见 [[tcapi-mod-ui-kit]]）：
   文档里的类名会被编译进产物，让「产物里搜不到」的检查出现假阳性。

## Notes

仓库当前**没有 CI**（无 `.github/workflows`），门禁完全依赖 pre-commit 钩子，
所以钩子的可复现安装本身是质量体系的一部分。
