---
id: tcapi-mod-app-shell
type: module-design
status: active
title: 前端外壳与路由
parent: tcapi-architecture
tags: [frontend, routing, shell]
---

# 前端外壳与路由

`src/main.tsx`、`src/App.tsx`、`src/lib/router.ts`、`src/hooks/use-route-meta.ts`、
`src/lib/chunk-error.ts`、`src/components/layout/*`。

## Responsibility

### 入口（`main.tsx`）

挂载 `QueryClientProvider` + `App` + `Toaster`，并在最外层包一个
`RootErrorBoundary`。边界捕获到异常时用 `innerHTML` 渲染静态兜底页
（含错误摘要与「刷新页面」按钮），保证任何情况下不白屏。
`#root` 缺失或首屏渲染抛错时，走同一条 `renderFallback`。

QueryClient 默认值：

- `refetchOnWindowFocus: false` —— 全局关闭。切回标签页让所有挂载查询一起回源
  会白耗边缘调用，并让内容在用户眼皮下无声跳动。需要准实时的查询**各自显式打开**：
  `statsQueryOptions()`（15s 轮询）与状态页健康检查（30s 轮询）。
- `retry: 1` —— 边缘 5xx 多为瞬时，重试一次足够；再多会拖长错误态出现时间。

### 路由（`lib/router.ts`）

零依赖 History API 实现，`useSyncExternalStore` 订阅。路由集合固定为
`['/', '/gallery', '/docs', '/status', '/admin']`。

- `normalize` 把尾斜杠剥掉，未知路径**归入首页**。
- 模块求值期（浏览器环境）若当前路径不在集合内，立刻 `replaceState` 改回 `/`，
  并延迟 300ms 播报软 404 toast（等 Toaster 订阅就绪）。回显路径截到 60 字符。
- `navigate(to, { replace })`：同址只滚不写历史；跨页时若浏览器支持且未要求减弱动效，
  走 `document.startViewTransition` 并在回调里 `flushSync` 提交，否则直接提交。
  提交后 `settleScroll`：有 hash 就等目标挂载（最多 20 帧）再滚，否则回顶部。

### 外壳（`App.tsx`）

- 路由分发 + 每个懒加载路由配一份**同形骨架**（`GalleryFallback` / `AdminFallback` /
  `StatusFallback` / `DocsFallback` / `RealtimeStatsFallback`）。骨架必须与真实区块
  高度接近，否则落地时的位移会推走用户正在看的内容（CLS）。
- `RouteErrorBoundary resetKey={route}` 把爆炸半径收进 `<main>`：坏的那一块显示
  错误 UI，页头/页脚/地址栏保留。
- 路由变化时把焦点移到 `<main tabIndex={-1}>`，下一帧执行（等懒加载挂载完）。
  首次挂载不抢焦点。
- 首页的 `randomRequest` 是唯一跨区块信号：`HeroSection` 写、`OnlinePreview` 读，
  用递增 `token` 而非布尔量，保证连续点同一标签也能各触发一次。

### 元信息（`use-route-meta.ts`）

按路由改写 `title` / `description` / `canonical` / `og:*` / `twitter:*` / `robots`。
`/admin` 带 `noindex, nofollow`，与 `edgeone.json` 的 `X-Robots-Tag` 与
`robots.txt` 的 `Disallow: /admin` 三处一致。

### Chunk 自愈（`lib/chunk-error.ts` + `RouteErrorBoundary`）

部署换代后旧页面持有的 hashed chunk 会 404。`isChunkLoadError` 用五个浏览器
形态的正则归类；命中则在 `componentDidCatch` 里自动 `location.reload()` 一次，
用 `sessionStorage` 时间戳做 15 秒冷却闸门（不用布尔量 —— 布尔量一旦被成功信号
清掉就会形成刷新循环）。手动「重试」对 chunk 错误也走 `location.reload()`：
`React.lazy` 会缓存被拒绝的 promise，只复位边界永远修不好。

## Boundary

外壳只依赖 `lib/*` 与 `components/*`，不直接调 `fetch`。所有数据请求都经
[[tcapi-mod-api-client]]。

## Invariants

1. **顶栏高度契约**：`--header-h` 由 CSS 变量定义，所有页面用
   `pt-[calc(var(--header-h)+Npx)]` 让出空间，不写死像素。
2. **软 404 必须改写地址栏**，不能只提示：SPA fallback 让任意错拼路径返回
   200 + 首页内容，地址栏与内容分裂会被 canonical 固化。
3. **跳转滚动尊重 `prefers-reduced-motion`**：JS 显式传 `behavior: 'smooth'`
   不受 CSS 媒体查询约束，必须过 `prefersReducedMotion()` 闸门。
4. **骨架同形**：懒加载 fallback 的结构与断点必须贴近真实区块，
   这是首屏 CLS 的主要控制手段。

## Notes

`useRouteMeta` 只对能执行 JS 的爬虫有效；社交抓取器看到的是 `index.html`
的静态元信息，这是 SPA 的固有取舍，见 [[tcapi-architecture]] 的 Out of scope。
