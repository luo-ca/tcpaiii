---
id: tcapi-architecture
type: architecture-design
status: active
title: 派次元 API 架构概览
tags: [architecture, edgeone, react, kv]
---

# 派次元 API 架构概览

## Drivers

派次元 API（`https://t.paiii.cn`）是一个**单仓双运行时**的项目：同一个仓库里既有
Vite + React 的静态前端，也有 EdgeOne Pages Functions 的边缘后端，二者通过
`/api/*` 契约耦合，数据落在 EdgeOne KV。

驱动设计的四条约束：

1. **零后端服务器**。全部读写在边缘函数里完成，没有数据库、没有常驻进程。
   状态只有两份 KV blob（图库 `images_kv:all`、统计 `stats_kv:data`），
   加上少量派生缓存（`images_kv:meta`、`stats_kv:admin_config`）。
2. **`/api/random` 是热路径**。它是唯一被外部站点高频调用的接口，默认 `302`
   重定向到第三方图床，必须在几百毫秒内返回，且统计写入不得拖慢或阻断它。
3. **写路径必须串行化**。KV 没有事务，所有图库写都是「读全量 → 本地改 → 写回」。
   并发写若交错会静默吞掉条目，因此后端用内存队列把整段 RMW 串起来。
4. **前端是唯一的错误展示层**。边缘函数只回英文短错误体（`{"error":"..."}`），
   中文文案、字段归一化、形状守卫全部收在前端边界层，避免脏数据把整页打到错误边界。

## Decisions

### 分层

```
浏览器
 ├─ 入口层      main.tsx（QueryClient / Toaster / RootErrorBoundary）
 ├─ 外壳层      App.tsx（路由分发 + 懒加载骨架 + RouteErrorBoundary）
 ├─ 页面层      features/*（gallery-browse / admin-page / status-page）
 │              components/sections/*（首页区块与文档页）
 ├─ 数据层      lib/api.ts（领域函数）+ lib/api-client.ts（传输、超时、错误翻译）
 ├─ 契约层      lib/types.ts、lib/constants.ts、lib/url.ts、lib/helpers.ts
 └─ 表现层      components/ui/*、components/states/*、index.css 设计令牌
──────────────────────────────────────────────────────────────
边缘（EdgeOne Pages Functions，/api/*）
 ├─ 分发层      api/\[\[default\]\].ts（路由表、方法校验、限流、统一 500）
 ├─ 领域层      lib/images.ts（图库 CRUD）、lib/stats.ts（统计）、lib/auth.ts（鉴权）
 ├─ 存储层      lib/kv.ts（KV 绑定解析、内存缓存、写队列、派生 meta）
 └─ 契约层      lib/types.ts（常量）、lib/validation.ts（输入归一化）、lib/response.ts
```

### 关键取舍

| 决策 | 取舍 |
| --- | --- |
| 自研 181 行 History API 路由，不引入 react-router | 全站 5 个静态路由、无嵌套/loader/预取；省 ~20KB gzip。代价是 `navigate` 需自己处理 hash 滚动、View Transition 与软 404 收口。 |
| 全部图库存在**单个** KV blob（`all`） | 图库规模 < 500 张，一次 get 换全量检索能力（标签索引、去重集合都在内存里建）。代价是每次写都要重写整份 blob，且必须串行。 |
| 后端独立编译（`edge-functions-src` → `edge-functions`） | 边缘运行时不能 import 前端代码；常量只能**成对重复定义**，用 `src/test/constants-parity.test.ts` 逐值比对来防漂移。 |
| 前端边界统一做形状守卫 | 接口字段类型漂移时（`tags` 是字符串、`items` 里混 `null`）宁可少一张图，也不让 React 抛 "Objects are not valid as a React child" 把整页打到错误边界。 |
| 错误文案在 `api-client` 层统一中文化 | 后端只回英文；`translateServerError` 一张正则表覆盖全部已知错误，逐条 `results[].error` 也过同一张表。 |
| 读接口分档缓存 | `stats` / 分页 `list` 发 `s-maxage=10, stale-while-revalidate=30`；`random`、`health`、全部写接口走全套 `no-store`。前端 `bustCache` 开关与之配对。 |

### 部署与门禁

- 构建：`npm run build` = `build:functions`（tsc 编译边缘源码）+ `vite build`（产物到 `dist/`）。
- 部署：`edgeone pages deploy -n tcpaiii`，按 `edgeone.json` 打包 `dist` + `edge-functions`。
- 门禁：`pre-commit` 钩子跑 `typecheck` + `lint` + `test` 三项（`build` 只转译不做类型检查，
  被 `typecheck` 覆盖大半，留给显式 `npm run check`）。
- `edge-functions/*.js` 是**提交进仓库的编译产物**，由 `edge-functions-sync.test.ts`
  现场重编译并逐字节比对，防止「源码一套、部署另一套」。

## Invariants

1. **KV 键名固定**：`images_kv` 下 `all`（权威图库）与 `meta`（派生标签/总数）；
   `stats_kv` 下 `data`（统计）与 `admin_config`（哈希密钥）。`all` 是唯一权威，
   `meta` 可由 `all` 重建，缺失时读取路径自动重建。
2. **写接口必须带 `Authorization: Bearer <token>`**；未配置任何密钥时返回 `503`，
   绝不放行写入。密钥三种来源优先级：`ADMIN_TOKEN` > `ADMIN_TOKEN_SHA256` > KV `admin_config`。
3. **图库 RMW 全程串行**（`withGalleryTransaction`），统计 RMW 全程串行（`_statsQueue`）。
4. **热路径统计失败不影响响应**：`/api/random` 把统计写入交给 `waitUntil`，
   无 `waitUntil` 时最多等 500ms 后放弃。
5. **前后端成对常量必须同值**：标题 120、标签 40、每图 20 个、URL 2048、
   批量 500、搜索 100、请求体 256KB、每页 24、时区 `Asia/Shanghai`。
6. **前端不持久化管理密钥**：只存在页面内存，刷新即失效；唯一持久化的用户数据是
   图片宽高比缓存（`paiii:image-ratios`）与 chunk 自愈冷却戳（`chunk-reload-at-ts`）。
7. **所有 `/api/*` 响应带 `X-Content-Type-Options: nosniff`**，包括走了可缓存分支的那几条。
   调用方通过 `json(..., { headers })` 追加的头**不能覆盖** `nosniff`、`content-type`
   与 `cache-control` / `cdn-cache-control` / `vary`：头名大小写不敏感，同名项按小写名
   剔除后再展开。`Headers` 对同名头是**拼接**而非后写者胜，漏剔会让
   `content-type` 变成 `text/html, application/json`，或让可缓存分支混进一段
   `no-store` 而彻底失去 CDN 缓存。
8. **未知前端路径归入首页并改写地址栏**（软 404 收口），保证 DOM / 地址栏 / canonical 三者一致。

## Out of scope

- 用户账号体系、多租户与权限分级：当前只有「公开读 + 单一管理密钥」两档。
- 图库分页的 cursor 化：现为 offset 分页，跨页重叠由前端按 id 去重兜住。
- 图片转存/图床：图库只存外链 URL，图片本体由第三方域名提供。
- 暗色模式：`index.css` 的令牌已预留（`@custom-variant dark`），但未实现。
- 服务端渲染 / SSG：纯 SPA，社交抓取器看到的是 `index.html` 的静态元信息。
