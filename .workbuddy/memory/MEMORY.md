# 派次元 API（tcpaiii / t.paiii.cn）— 项目长期记忆

## 项目定位
派次元 API 前端 + 腾讯云 EdgeOne Pages Functions 后端。线上域名 `https://t.paiii.cn`。
提供随机图片 API（302 直链 / JSON 双模式）、图库增删改查、批量导入、调用统计。数据存 EdgeOne KV（`images_kv` / `stats_kv`）。

## 技术栈与约束
- 前端：React 18 + Vite 5 + TypeScript + Tailwind CSS v4（`@theme inline` token 体系）+ Radix UI + TanStack Query + sonner。
- 后端：函数源码在 `edge-functions-src/api/[[default]].ts`，`npm run build:functions` 编译产出 `edge-functions/api/[[default]].js`。
- 部署：EdgeOne Pages，项目名固定 `tcpaiii`；`edgeone.json` 控制构建。
- 鉴权：写接口需 `Authorization: Bearer <ADMIN_TOKEN>`，前端密钥只存内存、不落 localStorage。

## 硬约束（踩过的坑）
- **✅ EdgeOne Pages 支持声明式 SPA fallback**（2026-07-23 官方文档确认，此条推翻了早前的错误结论）：
  `edgeone.json` 里写 `"rewrites": [{ "source": "/*", "destination": "/index.html" }]` 会被平台**精确识别为 SPA fallback**，
  官方原文：*"请求优先匹配项目中的其他路由（包括静态资源和函数），仅在未命中任何其他路由时返回 /index.html，并交由前端路由处理。该规则不会作为普通重写规则生效。"*
  → 所以 **`/docs`、`/gallery` 这类深链接可以直接访问，且不影响 `/api/*` 与静态资源**。不需要写 `middleware.js`。
  （通用 `rewrites` 说明里的"仅适用于静态资源访问"指的是**普通重写**，与这条专用 SPA fallback 是两回事。）
- 若真要用 `middleware.js`：它在**所有请求之前**执行（含静态资源！），必须自己放行 `/api/*` 与带扩展名的资源，风险高于上面那条声明式配置。
- EdgeOne KV 的 key 只能使用数字、字母、冒号和下划线。
- 中文字符编码在本项目中出过问题（见 `PROJECT_IMPROVEMENTS.md`），改动含中文的源文件后需确认 UTF-8 编码正确。
- 已配置代码分割（`vite.config.ts` 的 `manualChunks`），改构建配置时勿破坏。
- **本地 `vite` 默认不代理 `/api`**（仅当设置了 `API_PROXY_TARGET` 才代理）。要看到真实数据必须：
  `API_PROXY_TARGET=https://t.paiii.cn vite --port 5178`。否则全站显示 0 / 空态，**不要误判为 bug**。
- **`node_modules` 曾出现不完整安装**：`lucide-react@0.564.0` 的 5 个 `.d.ts` 全部缺失（导致 17 个文件 TS7016）。
  已按 lock 的 sha512 校验后从官方 tarball 补回。若 TS7016 复现，先怀疑镜像源给了残缺包。详见 `UI-REFACTOR-PLAN.md` 11.2。
- 仓库行尾统一 **LF**（2026-09-10 字节级普查复验：HEAD blob 中文本文件 **87 个 LF / 0 个 CRLF** + 1 个二进制 `public/og.png`；
  `core.autocrlf=false`、无 `.gitattributes`）。**写文件一律用 LF，别引入 CRLF。**
  - ⚠️ **别用 `grep -c $'\r' 文件` 查行尾**：在 `$(...)` + 嵌套引号里会误报"每行都含 CR"（实测把一个纯 LF 文件的 100 行全判成 CRLF）。
    可靠做法是用 Python 数字节：`pathlib.Path(f).read_bytes()` 后比较 `\r` 与 `\n` 的数量。
    交叉验证最省事的是 `git diff --numstat`——**若行尾被整体翻转，改动量会等于整个文件行数**。
- `wmic` 被沙箱禁用、Git Bash 下 `taskkill //PID` 会报参数错 → 用 PowerShell `Stop-Process -Id <pid> -Force`。
- `rm -rf dist` 会被沙箱安全删除守卫拦（vite 清空 dist 时同样触发）→ 构建前需先手动删 `dist`。
- **Tailwind v4 的 `hover:` 变体 = `@media (hover: hover) { &:hover }`** → 触摸设备（primary pointer 为 coarse）上 **`hover:` / `group-hover:` 一律不生效**。
  凡"只在 hover 露出"的信息，触摸端会完全看不到。需要触摸端常显时用 **`pointer-coarse:`** 变体补一条（如 `opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100`）。
- 动效降级优先用 Tailwind 内置的 **`motion-safe:` / `motion-reduce:`** 前缀，而不是自定义类 + CSS 覆盖。
- **检查产物 CSS 要兼容压缩格式**：媒体查询压缩后无空格（`@media (pointer:coarse)`），按 `pointer: coarse` 去 grep 会误判"没生成"。

## 图库数据事实（2026-09-10 实测，勿凭直觉改）
- 图库图片是**横构图壁纸**（`3500×2475` / `3840×2160` / `5000×2813` 这类），接口**不返回宽高**。
  采样：第 1 页 16 有效 → 15 横 1 竖（中位 1.623）；跨第 1/5/9 页 24 有效 → **全部横构图**（中位 1.778）。
- 因此瀑布流的默认占位比例是 **`DEFAULT_RATIO = 16/9`**（曾误设 `3/4`：平均绝对偏差 0.989 vs 0.064）。
- **图库首访 CLS ≈ 0.048，已在 Google good(<0.1) 区间**。要彻底归零需让 `/api/list` 返回每张图宽高
  （改 KV 记录结构 + 导入流程 + 存量回填），收益与成本不成比例 —— **已判定不做，不必重复评估**。
- 同域图片是 `img.static.paiii.cn`；用 `new Image()` 批量测尺寸时**并发别超过 4**（CDN 会限流，6 并发即大量失败）。
- **图片托管方没有开通图片处理**（2026-09-10 实测 6 种语法全部返回原图字节、md5 一致）：
  `?imageMogr2/thumbnail/600x`、`!600x`、`/format/webp`、`/crop/600x400`、`?imageView2/2/w/600`、`?x-oss-process=image/resize,w_600`。
  响应头 `EO-Cache-Status`/`EO-LOG-UUID` → 托管在**腾讯云 EdgeOne**，源站路径 `imgtcpaiii/...` 形似同名 COS 桶。
  → **前端无法做任何缩略图**；想减体积必须先让托管方开启图片处理（或改导入流程生成派生图）。
- **图库首屏 24 张原图 = 9.27 MB**（平均 395 KB、最大 1362 KB），原图高达 `5760×3240`，而显示槽位只有 264px（桌面）/ 173px（手机）宽。
  实测把 24 张按 **600px 宽 WebP q80** 重编码 → **0.88 MB（−90.5%）**。这是本项目最大的一笔性能债。
- 4G 限速实测 LCP：图库桌面 **8226 ms** / 手机 **10029 ms**（Poor）；首页手机 589 ms。

## 性能测量的三个坑（2026-09-10 返工三次换来的）
1. **跨域资源取不到字节数**：`img.static.paiii.cn` 无 `Timing-Allow-Origin` → Resource Timing 的 `transferSize`/`encodedBodySize` **恒为 0**。
   必须用 Playwright `page.on('response')` 读 `content-length`，或落盘 `curl` + `wc -c`。
2. **禁止用 dev server 测性能**：dev 下 Vite 不打包（87 个模块）→ 限速时 DCL 7 秒，LCP 会落到 `index.html` 的占位文字上。
   必须 `npm run build` + `API_PROXY_TARGET=... vite preview --port 4178`（`preview.proxy` 默认继承 `server.proxy`）。
3. **LCP 采集窗口必须长于"下完整页"**：4G 下 9.3 MB ≈ 19 s。窗口 6 s 读出 6.3 s、26 s 读出 8.2 s —— 前者是截断假值。
   限速用 CDP：`ctx.newCDPSession(page)` → `Network.emulateNetworkConditions`。

- **CSS multi-column 逐列向下填充，DOM 顺序 ≠ 视觉首屏顺序**（实测）：桌面 4 列时 DOM `0,1,2,3,4` 全在第 1 列，
  首屏 15 张的起点索引是 `0,5,11,18`；手机 2 列首屏只有 `0,1,11,12`。
  → **"给前 N 张加 fetchpriority"是错的**；且实测给单张加优先级**无法改善 LCP**（LCP 元素是随机后到的大图）。
- 已加 `preconnect`/`dns-prefetch` 到 `img.static.paiii.cn`（`index.html`）。

## 本地可视化验证（Playwright，已重复使用）
本环境**无法直接查看图片**，因此验证一律靠 `page.evaluate` 读 DOM 文本/属性做断言，截图仅作留档（存 `.workbuddy/shots/`）。
现成脚本见 `.workbuddy/shots/`：`routes.mjs`、`p2-routes.mjs`、`p2-filter-check.mjs`、`p2-loadmore-check.mjs`、`p3-hero-check.mjs`、`p3-copy-check.mjs`、
`p5-payload.mjs`（真实传输体积）、`p5-payload-throttled.mjs`（4G/3G 限速首屏）、`p5-lcp-attribution.mjs`（LCP 元素归因，`TAIL` 控制采集窗口）、`p5-fold-order.mjs`（瀑布流首屏实际可见索引）。
体积量化：`.workbuddy/tmp-probe/probe-resize.py`（用系统 Python `C:/python/py311/python.exe`，**它才有 Pillow 12**，托管版没有）。骨架：

```js
import { createRequire } from 'node:module';
// playwright-core 装在托管 node workspace 里，必须用 createRequire 指过去
const require = createRequire('C:/Users/29042/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright-core');
const EXE = 'C:/Users/29042/AppData/Local/ms-playwright/chromium-1148/chrome-win/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE });
```

- 运行：`"C:/Users/29042/.workbuddy/binaries/node/versions/22.22.2-2/node.exe" .workbuddy/shots/xxx.mjs`
- **必须先**用 `API_PROXY_TARGET=https://t.paiii.cn vite --port 5178` 起 dev server，否则页面全是 0/空态。
- 抓网络请求时**端点要对**：列表是 `GET /api/list`（不是 `/api/images`），随机是 `/api/random`。写错过滤条件会得到"筛选失效"的假阴性。
- 判断筛选/分页是否生效看**总数或瓦片数变化**，不要只看首屏图片是否相同（最新图片可能恰好都命中同一标签）。

## 设计规范（2026-09-10 定稿，待落地）
- **唯一色源**：品牌色取自 Logo `https://imgs.paiii.cn/logo.svg` —— `#007AFF → #5856D6`（iOS systemBlue → systemIndigo）。其余蓝色一律废弃。
- **明暗**：全站浅色（工具感）。图片是页面唯一的多彩来源。
- **风格**：容器中性克制（Apple 精致风），视觉张力全部交给图片（二次元沉浸感）。观感目标 ≈ Apple Photos 浅色版。
- **圆角六档单调递进**（P0 定稿）：8 / 10 / 12 / 16 / 20 / 24px + 999px 药丸。
  注意：初版计划写的"只三档"未采用——代码里有 160 处圆角分布在 6 个 Tailwind 档位，压成 3 档回归风险远大于收益；
  真正修掉的问题是**层级倒挂**（原 `--radius-lg`=24px 竟大于 `--radius-2xl`=16px）。
- **阴影只三档**：`--shadow-sm/md/lg`（基于 `rgba(11,18,32,...)`）。禁止硬编码 `shadow-[...]`。
- **不引入外部字体**（中文字体伤 LCP）；数字统一 `tabular-nums`。
- **不做暗色模式**（保留 `.dark` 变量占位）。

## 用户偏好
- 报告用中文、正式、结构化，大量使用表格；需要可导出/可保存的 Markdown 文件。
- 强调"看得见的证据"——诊断结论需给出具体文件与行号。
- 关注专业感与细节完成度（空/错/载三态、分享卡片、数字可信度）。

## 前端路由（2026-09-10 P1 落地，P2 完成图库拆分）
- 零依赖自研：`src/lib/router.ts`（`ROUTES`/`RoutePath`/`useRoute`/`navigate`）+ `src/components/ui/nav-link.tsx`（真 `<a href>` + 左键接管）。
- 四个路由：
  - `/` = 首页；`/docs` = API 文档 + 安全特性。
  - `/gallery` = **面向访客的公共瀑布流浏览页**（`src/features/gallery-browse.tsx`）—— 灯箱 + 标签筛选 + 搜索 + 加载更多。`index, follow`，进 sitemap。
  - `/admin` = **图片管理后台**（`src/features/admin-page.tsx`，由原 `gallery-page.tsx` 改名）—— 需 admin token。`noindex, nofollow`，不进 sitemap、不进主导航；仅页脚一个低调入口，`robots.txt` 全面 `Disallow: /admin`。
- 路由元信息由 `src/hooks/use-route-meta.ts` 按路由同步 title/canonical/og/**robots meta**（`noindex` 路由注入 `robots=noindex, nofollow`）。
- 公共图库关键技术：`useInfiniteQuery` 分页（`BROWSE_PAGE_SIZE=24`，端点 `GET /api/list`）+ `keepPreviousData`；CSS columns 瀑布流；`src/lib/image-ratio.ts` 缓存宽高比做 `aspect-ratio` 占位以压 CLS（首次访问仍轻微抖动，后端不返尺寸）；Radix Dialog 灯箱带方向键切换。
- **文案约定**：站点面向中文用户，H1 为「二次元图片 / 人人可用」；`src/test/app-copy.test.ts` 的中文一律写成 `\uXXXX` 字面量转义（文件内不出现原始 CJK），组件 JSX 则直接写中文。

## 相关文档
- `UI-REFACTOR-PLAN.md` — UI/UX 重构行动规划（P0/P1/P2/P3/P4/P5 记录见第 10–15 节；第 15 节 = 图片载荷调查 + 待决策项）
- `PROJECT_IMPROVEMENTS.md` — 2026-05-01 的构建与编码优化记录
- `README.md` — API 行为、KV 绑定、鉴权、部署流程
