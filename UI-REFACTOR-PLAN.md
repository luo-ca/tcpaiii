# 派次元 API 前端 UI / UX 重构行动规划

> 状态：**待确认**（第 9 节有 3 个决策点需要拍板后方可开工）
> 目标站点：https://t.paiii.cn ｜ 技术栈：React 18 + Vite 5 + Tailwind v4 + Radix + TanStack Query ｜ 部署：腾讯云 EdgeOne Pages

---

## 1. 诊断结论：五条硬发现

前四条都能在代码里逐行验证，不是主观判断。

| # | 发现 | 证据（文件:行） | 影响 |
|---|---|---|---|
| 1 | **品牌色在 HTML 与 CSS 之间就已打架** | `index.html` 声明 `theme-color: #007AFF`；`src/index.css:16` 定义 `primary: hsl(222 89% 55%)` ≈ `#2663F2` | 全站"拼凑感"的总根源 |
| 2 | **界面并存四套互不相同的蓝色** | token `#2663F2`；Logo `#007AFF→#5856D6`；按钮 `blue-600→blue-500`(HeroSection.tsx:125, OnlinePreview.tsx:349)；首屏标题 `sky-300→violet-300`(HeroSection.tsx:99) | 缺乏统一视觉语言 |
| 3 | **首页每次访问都消耗 1 次 API 调用** | `HeroSection.tsx:31` 调 `fetchRandomImageWithFallback()`，走 `GET /api/random` | **污染自家统计口径**；且拖慢 LCP |
| 4 | **同一个文档组件被渲染两次** | `App.tsx:60`（random tab）与 `App.tsx:97`（docs tab）各一次 `<ApiDocsSection />` | 信息架构冗余的直接证据 |
| 5 | **无前端路由** | `App.tsx:37` 用 `useState<AppTab>` 切页；`public/sitemap.xml` 只有 1 条 URL | 文档不可分享、不可索引、刷新回首页、前进后退失效 |

### 1.1 附带的专业感硬伤

| 问题 | 位置 | 后果 |
|---|---|---|
| `og:image` 指向 SVG | `index.html` → `https://imgs.paiii.cn/logo.svg` | 微信 / X / Facebook **均不渲染 SVG**，分享链接无预览图 |
| `theme-color` 与主题不符 | `index.html` → `black-translucent`（配深色状态栏） | 全站浅色，移动端状态栏区域观感突兀 |
| 语言不一致 | `<html lang="zh-CN">` 但 H1 为 `anime images for anyone` | 中文站用英文主标题，专业感受损 |
| 统计数据可能为 0 | `kv.json` → `{"totalRequests":0}` | 首屏展示「累计调用 0 次」比不展示更伤 |
| 焦点可见性被关闭 | `HeroSection.tsx:120` → `focus-visible:ring-0` | 键盘用户无法感知焦点位置 |
| 跨组件通信靠 DOM 与全局事件 | `HeroSection.tsx:58,61` + `OnlinePreview.tsx:132` | 每新增区块就多一层脆弱耦合 |

---

## 2. 已确认的设计决策（来自两轮问答）

| 维度 | 决策 | 含义 |
|---|---|---|
| 服务对象 | **两者并重，明确主次** | 首屏做双通道分流：接入者 → 文档/地址；逛图者 → 图库 |
| 最痛的点 | 信息架构乱 · 视觉不统一 · 交互不顺畅 | 三项都在本轮范围内；移动端排后 |
| 改造力度 | **先看方案再定** | 本文档即方案；确认后再动代码 |
| 验收标准 | **专业感：看起来像正经产品** | 细节、状态、数字、性能都要站得住 |
| 图片内容 | **混合内容，尺寸不统一** | 图库必须支持混合比例 → 瀑布流 |
| 主色 | **以 Logo 渐变蓝紫为唯一色源** | `#007AFF → #5856D6`，其余三套蓝全部废弃 |
| 明暗取向 | **全站浅色（工具感）** | 深色首屏方案废弃；图片是唯一的色彩来源 |
| 审美风格 | Apple / iOS 精致风 ＋ 二次元沉浸感 | 见 4.4 张力解法 |

---

## 3. 目标与验收标准

### 3.1 核心目标

1. **视觉**：全站一套设计语言，色值、圆角、阴影、间距全部来自 token，硬编码归零。
2. **结构**：3 条路由，每个区块只渲染一次，核心动作（复制地址）进入首屏。
3. **交互**：状态单向流动，无 DOM 查询、无全局事件；所有异步操作有明确的载入/空/错三态。
4. **专业**：分享卡片有图，每个出现的数字都有意义，无布局跳动。

### 3.2 可验证验收标准

| 标准 | 验证方式 |
|---|---|
| 色值统一 | `grep -rn "blue-600\|sky-300\|violet-300\|hsl(222 89% 55%)" src/` 返回 0 条 |
| 阴影统一 | `grep -rn "shadow-\[" src/` 返回 0 条（全部改 token） |
| 文档不重复 | `grep -rn "ApiDocsSection" src/App.tsx` 只命中 1 处 |
| 无 DOM 查询 | `grep -rn "getElementById\|CustomEvent" src/` 返回 0 条 |
| 统计不被污染 | 访问首页后 `GET /api/stats` 的 `totalRequests` 不增加 |
| 路由可分享 | 直接访问 `/docs` 返回 200 且渲染文档页 |
| 无布局跳动 | Chrome DevTools Performance 中 CLS < 0.1 |
| 分享有图 | 用微信 / X 调试工具检查 `og:image` 能渲染出预览图 |

---

## 4. 设计语言定稿

### 4.1 色彩 tokens（写入 `src/index.css` 的 `@theme inline`）

```css
/* 品牌：唯一色源，取自 Logo */
--color-brand-50:  #EBF4FF;   /* 选中态底、标签底 */
--color-brand-100: #D6E9FF;   /* 悬浮底 */
--color-brand-400: #4DA2FF;   /* 浅色强调 */
--color-brand-500: #007AFF;   /* 主色（= logo 起点 = theme-color） */
--color-brand-600: #0062CC;   /* hover / 按下 */
--color-brand-700: #004C9E;   /* 文字型强调（保证对比度） */
--color-brand-alt: #5856D6;   /* 渐变终点，仅用于 Logo 与主 CTA */

/* 中性：全站 95% 的面积由这 6 个值构成 */
--color-bg-page:    #F7F8FA;
--color-bg-surface: #FFFFFF;
--color-bg-subtle:  #F1F3F7;
--color-text-1:     #0B1220;
--color-text-2:     #5A6474;
--color-text-3:     #8C96A6;
--color-border:     #E4E8EF;
--color-border-strong: #D3D9E3;

/* 语义色：沿用 Apple 系统色，与品牌同源 */
--color-success: #34C759;
--color-warning: #FF9F0A;
--color-danger:  #FF3B30;
```

**使用规则（严格执行）**

- 品牌色**只**出现在：主 CTA、当前选中项、链接、焦点环、Logo、强调数字。
- 渐变**只**用于 Logo 与主 CTA，其余一律纯色。
- 除品牌与语义色外，**不得引入任何新色相**。图片是全站唯一的多彩来源。

### 4.2 圆角 / 阴影 / 间距

| Token | 值 | 用途 |
|---|---|---|
| `--radius-sm` | 10px | 输入框、标签、小按钮 |
| `--radius-md` | 16px | 卡片 |
| `--radius-lg` | 24px | 大容器、预览面板 |
| `--radius-full` | 999px | 主 CTA、chip |

```css
--shadow-sm: 0 1px 2px rgba(11, 18, 32, .04);
--shadow-md: 0 4px 16px rgba(11, 18, 32, .06);
--shadow-lg: 0 16px 48px rgba(11, 18, 32, .08);
```

- 间距基准 **8px**；区块垂直内边距 96 / 80 / 64（桌面 / 平板 / 移动）。
- 现状问题：`--radius` 是 1.25rem（20px）、`--radius-xl` 是 2rem（32px），且代码里 `rounded-[1.5rem]`、`rounded-2xl`、`rounded-full` 混用 → 层级感被抹平。收敛为**三档**。
- 现状问题：`OnlinePreview.tsx:159` 单条阴影写了 4 层 → 归入 `--shadow-lg`。

### 4.3 字体层级

| 层级 | 字号 / 行高 | 字重 | 字距 | 用途 |
|---|---|---|---|---|
| Display | 48 / 56 | 700 | -0.02em | 仅首屏 H1 |
| H1 | 32 / 40 | 700 | -0.02em | 区块主标题 |
| H2 | 24 / 32 | 600 | -0.01em | 卡片标题 |
| H3 | 18 / 28 | 600 | 0 | 小节标题 |
| Body | 15 / 24 | 400 | 0 | 正文 |
| Caption | 13 / 20 | 400 | 0 | 辅助文字，用 `--color-text-2` |
| Mono | 13 / 20 | 400 | 0 | 接口地址、代码，用 `ui-monospace` |

- 所有数字加 `font-variant-numeric: tabular-nums`，防止统计跳动时宽度抖动。
- **不引入外部字体**：中文字体体积大，会直接伤害 LCP，与"专业感"目标冲突。

### 4.4 「浅色工具感」与「二次元沉浸感」的张力解法

你同时选了这两个方向，而二次元沉浸感通常靠深色底实现。解法是**分工，而不是折中**：

- **容器层** → 工具感：全部中性灰白，克制、干净、信息清晰。
- **内容层** → 沉浸感：把全部视觉张力交给图片本身。
  - 图片容器统一加浅色描边 + `--shadow-md`，让图"浮"在页面上
  - 卡片 hover 时图片轻微放大（`scale(1.03)`，200ms）＋阴影升到 `--shadow-lg`
  - 标签胶囊用品牌 50 号底色，克制但有色
  - 图库网格用混合比例瀑布流，强调"图片墙"的密度感

这样得到的观感接近 **Apple Photos 的浅色版**：页面本身安静，图片自己说话。

---

## 5. 信息架构重构方案

### 5.1 路由方案（含技术风险）

> **⚠️ 本节初版结论有误，已更正。** 初版依据 `rewrites` 通用说明中的一句"仅适用于静态资源访问"，
> 判定 `edgeone.json` 无法做 SPA 兜底，转而计划写 `middleware.js`。
> 复核官方文档时发现 `edgeone.json` 文档里有一段**专门的「SPA 前端路由」小节**
> （cloud.tencent.com/document/product/248/127389，2026-07-23 更新），原文：
> *"Makers 会将该精确配置识别为 SPA fallback：请求优先匹配项目中的其他路由（包括静态资源和函数），
> 仅在未命中任何其他路由时返回 `/index.html`，并交由前端路由处理。该规则不会作为普通重写规则生效。"*
> 即：**存在一条专用的、声明式的 SPA 兜底配置**，且它天然避开了静态资源与 `/api/*`。
> 因此最终**没有引入 `middleware.js`**（中间件会在静态资源之前拦截一切请求，对本站是净增风险）。

**最终采用方案**：`edgeone.json` 声明式 SPA fallback + 前端 History 路由。

```json
{ "rewrites": [{ "source": "/*", "destination": "/index.html" }] }
```

| 方案 | URL 形态 | SEO | 服务器依赖 | 风险 | 结论 |
|---|---|---|---|---|---|
| **A. 声明式 SPA fallback**（History + `edgeone.json`） | `/docs` | ✅ | 仅上面那一行配置 | **低**（官方专用机制，只在不命中静态资源/函数时生效） | ✅ **已采用** |
| B. History + `middleware.js` | `/docs` | ✅ | 根目录 `middleware.js` | 中：中间件早于静态资源执行，需自己排除 `/api/*` 与带扩展名资源 | 已否决 |
| C. 哈希路由 | `/#/docs` | ❌ 搜索引擎忽略 hash | 无 | 低 | 已否决（放弃 SEO） |

**本地验证结论**（vite dev 默认自带 SPA 回落，可先验前端部分）：三条路由直连均 200；
`/` → 点「图库」URL 变为 `/gallery` 且 **未整页刷新**（window 标记存活）；浏览器后退正常；
在 `/docs` 点页脚 `/#changelog` 能跨页回到首页并滚到 4960px 处的更新日志。生产环境的
fallback 由上面那行 `edgeone.json` 配置承担。

路由职责划分：

| 路径 | 内容 |
|---|---|
| `/` | Hero（含首屏可复制的 API 地址）+ 在线预览 + 图库精选 + 实时统计 + 为什么选择 + 文档入口 + 图片投稿 + 更新日志 |
| `/gallery` | 现有的「图片管理」控制台（外链图库增删改查 + 批量导入） |
| `/docs` | 完整 API 文档 + 安全特性 |

> **遗留的 IA 问题（P2 优先项）**：顶栏第二项叫「图库」，但 `/gallery` 实际是**需要管理密钥的
> 「图片管理」后台**（首屏就是「管理密钥」输入框 + 只读模式）。对访客而言，点「图库」期待的是
> 浏览页，落地却是后台 —— 这是一个**名实不符**。建议 P2 拆分为：
> `/gallery` = 面向访客的公共浏览页（瀑布流）；管理后台迁到 `/admin`（或保持 `/gallery` 但加
> 访客/管理双模式 gate）。**本次 P1 未擅自改动该语义**，只在首页图库精选区刻意不放
> 「浏览完整图库」按钮，避免把人送进后台。

### 5.2 首页区块调整

| 区块 | 现状 | 调整 | 理由 |
|---|---|---|---|
| Hero | 全屏随机大图、英文 H1、搜索框 | 精简高度；中文 H1 + 一句价值主张 + 双 CTA（「拿一张图」「查看文档」） | 3 秒说清这是什么 |
| **API 地址条** | 藏在预览卡侧栏（第 2 屏） | **提取为首屏独立区块，带复制按钮** | 核心动作前置 |
| 在线预览 | 第 2 屏，`min-h-[460px]` | 保留，收紧高度，图片主导 | 图片是主角 |
| 精选图片 | **无** | **新增，8–12 张，指向 `/gallery`** | 建立"逛图"通道 |
| 实时统计 | 无条件展示 | 无数据时隐藏，显示"新上线・欢迎试用" | 消除"0 次调用"尴尬 |
| API 文档 | 首页 + 文档页各一份 | **首页只留入口卡，完整内容移到 `/docs`** | 消除重复渲染 |
| 图片投稿 / 更新日志 | 各占一屏 | 聚合进页脚或 `/docs` | 首页减负 |

### 5.3 图库页（需支持混合比例）

- 布局改为 **CSS 瀑布流**（`columns` 或 grid masonry），卡片高度自适应原图比例。
- 每张卡片外层用 `aspect-ratio` 占位，图片加载完成后替换 → **把 CLS 压到 0**。
- 管理密钥输入改为顶部可折叠工具条，避免每次滚动都看到。
- 空状态必须专门设计（当前图库可能为空）：一句说明 + 引导 CTA，而不是空白网格。

---

## 6. 交互体验修复清单

| # | 问题 | 现状 | 改法 |
|---|---|---|---|
| 1 | 跨组件通信 | `HeroSection` 用 `getElementById('preview')` + `dispatchEvent(new CustomEvent('paiii:select-tag'))`；`OnlinePreview` 监听事件 + 靠 `shuffleTrigger` 计数 | 状态提升到 `App`（持有 `selectedTag` 与 `shuffleToken`），通过 props 单向传递；删除事件与 DOM 查询 |
| 2 | 复制反馈重复 | `OnlinePreview` 组件内维护 `copied` / `copiedApi` 两个 state，与 sonner toast 并行 | 统一走 sonner，按钮只保留瞬时的图标切换（用同一 hook 收敛） |
| 3 | 首屏背景污染统计 | `HeroSection.tsx:31` 调 `fetchRandomImageWithFallback()` | 改用固定精选图（`HERO_FALLBACK_IMAGE_URL`）＋ `<link rel="preload">`；不再调 `/api/random` |
| 4 | 移动端 header 遮挡 | Header 为 `fixed`，移动端两行（`h-14` 56px + 第二行 nav ≈ 40px）≈ 96px，而 Hero 仅 `pt-20`(80px) | 定义 `--header-h` 变量，桌面 64px / 移动 56px；Header 改单行 + 底部 Tab Bar 或抽屉；各区块统一用变量补偿 |
| 5 | 三态缺失 | 各区块自行处理 loading / empty / error，样式不一 | 抽出统一 `LoadingState` / `EmptyState` / `ErrorState` 组件 |
| 6 | 焦点可见性 | `HeroSection.tsx:120` 的 `focus-visible:ring-0` 移除了焦点环 | 全局 `:focus-visible` 统一为 2px 品牌色环 + 2px 偏移 |
| 7 | 滚动定位不一致 | 仅 `#preview` 有 `scroll-mt-20` | 用 `scroll-margin-top: var(--header-h)` 统一 |
| 8 | 动效无降级 | `animate-ping` / `float` / `shimmer` 无条件播放 | 全部包进 `@media (prefers-reduced-motion: no-preference)` |

---

## 7. 执行计划

### P0 · 视觉地基（低风险，不动结构，可独立交付）

改完立刻能看到明显变化，且**不触碰 `App.tsx` 的结构**。

| # | 任务 | 主要文件 | 验收 |
|---|---|---|---|
| 1 | 建立色彩 token，替换四套蓝 | `src/index.css`、`Header.tsx`、`HeroSection.tsx`、`OnlinePreview.tsx`、`components/ui/button.tsx` | `grep` 四套旧色值返回 0 |
| 2 | 圆角 / 阴影 / 间距 token 收敛 | `src/index.css` + 各区块 className | `grep "shadow-\[" src/` 返回 0 |
| 3 | Hero 停止消耗 API 统计 + 预加载固定图 | `HeroSection.tsx`、`lib/constants.ts` | 访问首页后 `totalRequests` 不增 |
| 4 | 移动端 header 高度变量 + 修复遮挡 | `src/index.css`、`Header.tsx` | 375px 宽下首屏内容不被压 |
| 5 | 复制反馈统一（收敛为一个 hook） | `OnlinePreview.tsx`、`lib/helpers.ts` | 单一 toast 来源 |
| 6 | `og:image` 换 PNG；语言与 H1 一致；`status-bar-style` 修正 | `index.html`、`lib/constants.ts` | 分享调试工具有预览图 |
| 7 | 数字统一 `tabular-nums`；`prefers-reduced-motion` 降级 | `src/index.css` | 统计刷新无宽度抖动 |

### P1 · 信息架构与交互（需先确认第 9 节决策点）

| # | 任务 | 主要文件 | 验收 |
|---|---|---|---|
| 8 | **路由方案 spike**：验证 `middleware.js` 能否兜底 | 新增 `middleware.js` | preview 环境 `/docs` 返回 200 |
| 9 | 落地路由，tab 拆为页面 | `App.tsx`、新增 `src/routes/` | 刷新不丢页、链接可分享 |
| 10 | 首页顺序重排 + API 地址条前置 | `App.tsx`、新增 `AddressBar.tsx` | 首屏无需滚动即可复制地址 |
| 11 | 移除首页重复的 `ApiDocsSection`，改入口卡 | `App.tsx` | 组件仅 1 处引用 |
| 12 | 状态提升，删除全局事件与 `getElementById` | `App.tsx`、`HeroSection.tsx`、`OnlinePreview.tsx` | `grep` 无 `CustomEvent` |
| 13 | 统计区块改为「有数据才显示」 | `RealtimeStats.tsx` | 0 数据时不出现 0 次 |
| 14 | 新增首页精选图片区 | 新增 `GalleryPreview.tsx` | 首页有逛图入口 |
| 15 | `sitemap.xml` 补 3 条 URL；`robots.txt` 同步 | `public/` | 3 条 URL 均可访问 |

### P2 · 深化与工程

| # | 任务 | 主要文件 | 验收 |
|---|---|---|---|
| 16 | 图库瀑布流 + 混合比例 + 防 CLS | `features/gallery-page.tsx` | CLS < 0.1，长图短图都不变形 |
| 17 | `gallery-page.tsx` 拆分（1316 行） | 拆到 `features/gallery/` | 单文件 < 300 行 |
| 18 | 统一空 / 错 / 载三态组件 | 新增 `components/states/` | 三态在全站样式一致 |
| 19 | hover / focus 微交互统一（图片 `scale(1.03)` + 阴影升级） | `src/index.css` | 交互手感一致 |
| 20 | 图片主色提取做卡片渐变晕（可选） | 新增 hook | 性能无明显回退才保留 |

**建议交付顺序**：P0 整体交付一次（立刻可见视觉收益）→ 确认无误后进 P1 → P2 按需分批。

---

## 8. 范围边界（明确不做）

- ❌ 不改后端 API 契约、不改 KV key 结构、不动 EdgeOne 部署流程
- ❌ 不引入组件库（继续用现有 Radix + 自研组件）
- ❌ 不引入外部字体（中文字体成本高，伤 LCP）
- ❌ 本轮不做暗色模式（已决定全站浅色）；但保留 `.dark` 变量占位，为将来留口
- ❌ 不做移动端深度重构（本轮优先级低于信息架构；只修遮挡与高度问题）

---

## 9. 待你确认的 3 个决策点

| # | 决策点 | 选项 | 影响 |
|---|---|---|---|
| 1 | 路由方案 | **B**（History + middleware，需先 spike）／ **A**（哈希，SEO 白做）／ **C**（404.html 兜底） | 决定文档能否被分享与索引 |
| 2 | 首页是否接受「移除完整 API 文档，只留入口卡」 | 接受 ／ 保留一份精简版 ／ 不接受 | 决定首页长度与 `/docs` 的流量 |
| 3 | 交付节奏 | **P0 先单独交付**（立刻看到视觉变化）／ P0+P1 一起上 | 决定你多快能看到效果 |

---

## 10. P0 实施记录

### 10.1 已完成项

| # | 任务 | 实际改动 |
|---|---|---|
| 1 | 色彩 token | 重建 `index.css` 的 `@theme inline`：新增 `brand-50~900`（`#007AFF` 系）与 `iris-50~900`（`#5856D6` 系）；`primary` / `ring` 指向 `#007AFF`；中性色改为 `#F7F8FA` / `#0B1220` / `#5A6474` / `#E4E8EF`；新增深色代码块 token `--color-code` |
| 2 | 色值收敛 | 批量替换 8 个旧色系：`blue`/`sky`/`cyan`/`teal` → `brand`；`indigo`/`violet`/`purple`/`fuchsia`/`pink` → `iris`；`slate-*` → 中性 token。四套蓝收敛为品牌两极 |
| 3 | 圆角体系 | 修复**非单调倒挂**（原 `--radius-lg`=24px 竟大于 `--radius-2xl`=16px），重设为 8/10/12/16/20/24 单调递进 |
| 4 | 阴影体系 | 新增 `--shadow-sm/md/lg`，移除全部硬编码 `shadow-[...]` |
| 5 | 首屏不再消耗 API | `HeroSection` 移除 `fetchRandomImageWithFallback` 调用（它会把本站自身访问写进 `/api/stats` 的调用数与站点数）。改为经 `/api/list` 取图库第一张图 —— 该接口**不写入统计**，因此既不消耗随机额度也不污染数据 |
| 5b | 坏图根因修复 | 原 `HERO_FALLBACK_IMAGE_URL`（第三方 text_to_image 接口）实测 302 跳到一个"图片生成中"占位图，并非真实图片。已**整条移除**该常量，无图时改由品牌渐变兜底，杜绝裂图/占位图 |
| 6 | 顶栏占位 | 新增 `--header-h`（桌面 64px / 移动 96px，与 Header 实际高度对齐）；Hero 改用 `pt-[calc(var(--header-h)+24px)]`；移除 5 处零散的 `scroll-mt-20`，改由全局 `[id]` 规则统一处理 |
| 7 | 焦点可见性 | 移除 `*:focus-visible` 中的 `border-radius: 4px`（原实现会给**所有**聚焦元素强制 4px 圆角，一键压平卡片圆角）；焦点环统一为品牌色；Hero 搜索框改用 `focus-within` 高亮外层 |
| 8 | 复制反馈收敛 | 新增 `src/hooks/use-copy-feedback.ts`；`OnlinePreview` 去掉两个手写 state 与裸 `setTimeout`（顺带修掉组件卸载后 setState 的问题） |
| 9 | 数字稳定性 | 统计数字统一 `tabular-nums`，刷新时不再宽度抖动 |
| 10 | 分享卡片 | 新增 `public/og.png`（1200×630，品牌渐变 + π 标识）；`og:image` / `twitter:image` / JSON-LD `image` 全部由 SVG 改为 PNG |
| 11 | 元信息 | `apple-mobile-web-app-status-bar-style` 由 `black-translucent` 改为 `default`（与浅色主题一致） |
| 12 | 死代码清理 | 移除 7 个零引用工具类（`text-gradient` / `text-gradient-warm` / `hover-scale` / `browser-window` / `browser-header` / `divider-gradient` / `text-balance`）；移除 `WhyChoose` 中"了解更多"这个指向不存在链接的**假交互** |
| 13 | 无障碍 | 循环与位移动效统一包进 `prefers-reduced-motion`；最小字号由 10px 提到 11px |
| 14 | React 18 属性兼容 | `fetchPriority`（驼峰）改小写展开 `{...{ fetchpriority: 'high' }}`。驼峰是 React 19 才识别的 API，React 18 下会被丢弃并抛控制台告警 |
| 15 | 首屏文案对比度 | 主视觉是**随机**图库图，亮度不可控。原 `text-white/75` 正文遇到接近纯白的图会糊掉（移动端实测复现）。新增"文本区中心径向暗场"并抬高垂直压暗下限，正文提到 `text-white/90` + 文字阴影，统计徽标底色 `bg-black/25→/35`。已用**纯白图极端测试**验证可读性 |

### 10.2 测试调整说明

`src/test/app-copy.test.ts` 的 `keeps first paint independent of the random-image API` 一条**原本自相矛盾**：用例标题要求首屏独立于随机图片 API，断言却要求 Hero 必须调用该 API（`expect(heroSource).toContain("fetchRandomImageWithFallback")`）。已改为断言 Hero **不得**出现 `fetchRandomImage`，使断言与用例意图一致。

### 10.3 与原计划的偏差

| 原计划 | 实际做法 | 原因 |
|---|---|---|
| 圆角只三档 | 六档**单调递进** 8/10/12/16/20/24 | 现有代码有 160 处圆角用法分布在 6 个 Tailwind 档位，压成 3 档需改上百处，回归风险远大于收益。单调递进已解决"层级倒挂"这一实际问题 |
| 固定图 + `link rel=preload` | 只做了固定图 | 图片 URL 是远程常量，写进 `index.html` 会造成同一串长 URL 双处维护。已用 `fetchPriority="high"` 覆盖首屏优先级；建议后续自托管 `public/hero.jpg` 再加 preload |
| 状态色并入 success/warning/danger | `emerald`/`amber`/`red` 保持 Tailwind 原值 | 它们语义独立（就绪/加载/错误），不影响"品牌色唯一"这一目标 |

### 10.4 留给 P1 的已知问题（P0 未动）

- `ApiDocsSection` 仍在两个 tab 中重复渲染（`App.tsx:60`、`App.tsx:97`）
- 无前端路由，文档页不可分享
- 首页仍需滚动才能拿到 API 地址（核心动作未前置）
- `HeroSection` ↔ `OnlinePreview` 仍靠 `getElementById` + `CustomEvent` 通信
- 统计条在无数据时仍会显示"累计调用 0 次"
- 图库页尚未支持混合比例（瀑布流）
- `H1` 仍是英文 `anime images for anyone`（`test/app-copy.test.ts` 有断言，改动时需同步）

---

## 11. P1 实施记录（信息架构与交互）

### 11.1 已完成项

| # | 任务 | 实际改动 |
|---|---|---|
| 1 | 路由地基 | 新增 `src/lib/router.ts`：`ROUTES`/`RoutePath`/`useRoute`（`useSyncExternalStore`，模块级单例，任意组件零成本订阅）/`navigate`/`settleScroll`。**零新依赖**——全站只有 3 个静态页、无嵌套路由与数据预取，引 react-router（~20KB gzip）不划算 |
| 2 | SPA 兜底 | `edgeone.json` 增加 `rewrites: [{source:"/*", destination:"/index.html"}]`。**未引入 `middleware.js`**（见 5.1 的更正） |
| 3 | 站内链接 | 新增 `src/components/ui/nav-link.tsx`：渲染真实 `<a href>`（保住中键/右键新标签/悬停看地址/爬虫抓取），仅接管「当前窗口左键单击」为客户端跳转 |
| 4 | tab → 真实路由 | `App.tsx` 用 `useRoute()` 取代 `useState<AppTab>`；`Header.tsx` 的 tab 按钮改为 `NavLink`，激活态由当前路由推导并输出 `aria-current="page"`；`AppTab` 类型删除 |
| 5 | **消除重复渲染** | `ApiDocsSection` 原先在 `App.tsx` 出现两次（home + docs）。现在只在 `/docs` 渲染一次 |
| 6 | 状态提升 | 删掉 `HeroSection` 的 `document.getElementById('preview')` + `window.dispatchEvent(new CustomEvent('paiii:select-tag'))`，以及 `OnlinePreview` 的对应监听。改为 `HomePage` 持有 `randomRequest: {tag, token}` + `previewRef`，经 props / `forwardRef` 单向下发 |
| 7 | 首页重排 | 顺序改为：Hero → 在线预览 → 图库精选 → 实时统计 → 为什么选择 → 文档入口 → 图片投稿 → 更新日志 |
| 8 | **API 地址前置** | Hero 搜索框下方新增一条可整行点击复制的 API 地址（`GET` 徽标 + 等宽 URL + 复制态）。核心动作进入首屏，不再需要滚到第 2 屏的预览卡侧栏 |
| 9 | 文档入口 | 首页不再塞完整文档，新增 `DocsTeaser`（轻量引导 + 跳 `/docs`） |
| 10 | 图库精选 | 新增 `GalleryPreview`：`/api/list` 取最新 8 张（**不写统计**），`aspect-[4/3]` 占位消除 CLS，加载失败的单张自行隐藏，整段在无图时收起 |
| 11 | 统计空值 | `RealtimeStats` 与 Hero 统计徽标在**无任何数据时整段不渲染**，不再摆一排「0 次」 |
| 12 | 页脚跨页 | 页脚「更新日志」由裸 `href="#changelog"` 改为 `NavLink to="/#changelog"`——它现在是全站共用，在 `/docs` 上点击需先回首页再滚到该区块 |
| 13 | 路由元信息 | 新增 `src/hooks/use-route-meta.ts`：按路由同步 `title`/`description`/`canonical`/`og:url`/`twitter:*`。原来静态写死的 canonical 会让 `/docs`、`/gallery` 在搜索引擎眼里都"等于"首页（重复内容） |
| 14 | sitemap | `public/sitemap.xml` 由 1 条 URL 扩到 3 条（`/`、`/docs`、`/gallery`） |
| 15 | 顶栏遮挡（补 P0 遗漏） | `/docs` 与 `/gallery` 作为**可直接访问的深链接**后，原先的 `py-16`/`py-24` 在移动端（header 96px）会顶进固定顶栏。统一改为 `pt-[calc(var(--header-h)+Npx)]` |

### 11.2 顺带修掉的一个真问题：`lucide-react` 类型声明整个缺失

排查 `tsc` 报错时发现 **17 个文件报 TS7016**（`lucide-react` 找不到声明文件）。追查：

- 本地 `node_modules/lucide-react/package.json` 声明 `types: dist/lucide-react.d.ts`，但 **`dist/` 下只有 `cjs`/`esm`/`umd` 三个目录，包内 `.d.ts` 数量为 0**；
- 从镜像重新下载官方 tarball，**sha512 与 `package-lock.json` 记录完全一致**（`sha512-JJ8GVTQqFwuliifD48U6+h7…`），说明是**本地安装损坏**，不是上游问题；
- 官方 tarball 内确实含 5 个 `.d.ts`（`dist/lucide-react.d.ts` 等）。

**处理**：只把这 5 个类型文件解出并放回 `node_modules/lucide-react/`（不碰 `package.json` / lock，不重装）。

同时对 `src/test/functions-api.test.ts` 的 `slowStatsKv` 补上 `TestKv` 标注并把 `put()` 改回 `Promise<void>`（原先用 `resolve(undefined as unknown as string)` 绕过类型，语义本就该是 `void`）。

**结果：`tsc -p tsconfig.app.json --noEmit` 从 19 个错误降到 0** —— 本项目首次类型检查全绿。

> ⚠️ 这是 `node_modules` 内的本地修复，不入库。若之后有人重新 `npm install` / `npm ci`，正常应该装到完整包；**若又出现 TS7016，说明镜像源再次给出了不完整的包**。

### 11.3 验证结果

| 项 | 结果 |
|---|---|
| `eslint .` | 通过（exit 0，无输出） |
| `tsc -p tsconfig.app.json --noEmit` | **0 错误**（修复前 19 个） |
| `tsc -p tsconfig.functions.json` | exit 0 |
| `vitest run` | **51/51 通过** |
| `vite build` | 成功，1875 modules，最大 chunk 仍为 `react-vendor` 142KB |
| 三路由直连 | `/`、`/docs`、`/gallery` 均 200，标题与 canonical 各自正确 |
| 客户端跳转 | 点「图库」→ URL 变 `/gallery` 且 window 标记存活（**未整页刷新**） |
| 浏览器后退 | `/gallery` → `/` 正常 |
| 跨页锚点 | 在 `/docs` 点页脚「更新日志」→ 回到 `/`、hash=`#changelog`、滚到 4960px |
| 控制台 | **0 报错** |

### 11.4 留给 P2

- `/gallery` 的**名实不符**：顶栏叫「图库」，落地是需密钥的「图片管理」后台。建议拆出面向访客的公共浏览页（见 5.1 末尾）。
- 图库混合比例瀑布流 + CLS 归零；`gallery-page.tsx`（1316 行）拆分。
- 首页 `H1` 仍是英文 `anime images for anyone`（`test/app-copy.test.ts` 有断言，改成中文需同步该断言）。
- 统一空/错/加载态；hover/focus 微交互；可选主色提取。

---

## 12. P2 实施记录：图库拆分（公共浏览 / 管理后台）

### 12.1 动机

P1 遗留的核心信息架构缺陷（见 5.1 末尾、11.4）：顶栏「图库」指向的 `/gallery` 实为**需要 admin token 的图片管理后台**，与访客预期严重不符。P2 把「浏览」与「管理」两件事彻底拆开：

| 路径 | 面向 | 职责 | 索引 |
|---|---|---|---|
| `/gallery` | 访客 | 瀑布流浏览 + 灯箱 + 标签/搜索筛选 | `index, follow`，进 sitemap |
| `/admin` | 管理员 | 图片管理控制台（增删改 / 批量导入） | `noindex, nofollow`，**不进 sitemap**，robots 屏蔽，导航不暴露 |

### 12.2 变更清单

| 文件 | 动作 | 说明 |
|---|---|---|
| `src/features/gallery-page.tsx` | `git mv` → `src/features/admin-page.tsx` | 1316 行原样保留（CRLF 未破坏），仅移出本地 `useDebouncedValue` |
| `src/features/gallery-browse.tsx` | **新增** | 公共 `/gallery` 页：`MasonryTile` + `Lightbox` + `useInfiniteQuery` 分页 + 标签 chips + 防抖搜索 + 三态 |
| `src/lib/image-ratio.ts` | **新增** | 图片宽高比缓存（内存 Map + localStorage `paiii:image-ratios`，上限 500 条），用于 `aspect-ratio` 占位 |
| `src/hooks/use-debounced-value.ts` | **新增** | 从页面内提取的共享防抖 Hook |
| `src/lib/router.ts` | 修改 | `ROUTES` 加入 `/admin`（注释说明刻意不进导航/sitemap） |
| `src/hooks/use-route-meta.ts` | 修改 | 新增 `/admin` 元信息（`noindex: true`）；`/gallery` 标题改「二次元图库」；**真正注入 `robots` meta** |
| `src/App.tsx` | 修改 | `/gallery`→`GalleryBrowse`、`/admin`→`AdminPage`（均 lazy）；`GalleryFallback` 改为瀑布流骨架屏 |
| `src/components/sections/GalleryPreview.tsx` | 修改 | 恢复「浏览完整图库」CTA → `/gallery`（此时才名副其实） |
| `src/components/layout/Footer.tsx` | 修改 | 新增低调的 `/admin`「管理」入口（`KeyRound` 图标） |
| `public/robots.txt` | 修改 | 全部 UA 增加 `Disallow: /admin` |
| `public/sitemap.xml` | 不变 | 仍只有 `/`、`/docs`、`/gallery`（**不含 `/admin`**） |

### 12.3 关键技术点

- **分页**：`useInfiniteQuery` + `keepPreviousData`，`BROWSE_PAGE_SIZE = 24`（后端 `MAX_LIST_PAGE_SIZE = 60`）。切标签/搜索时保留上一批并降透明度，避免整块闪白。
- **CLS 缓解**：后端不返回图片尺寸，故用 `image-ratio.ts` 缓存真实宽高比，`MasonryTile` 以 `aspect-ratio` 占位（默认 3/4）。**首次访问**仍会有轻微抖动（无缓存），但该图一旦加载过，后续访问布局即稳定。
- **灯箱**：Radix `Dialog`（自带焦点陷阱、Esc 关闭），补 `ArrowLeft/ArrowRight` 键切换，含「复制地址」「原图」入口。
- **瀑布流**：CSS `columns-2 sm:columns-3 lg:columns-4` + `break-inside-avoid`，无需 JS 布局计算。

### 12.4 验证结果（对运行中的 dev server 实跑 Playwright）

| 项 | 结果 |
|---|---|
| `/gallery` 直连 | title=「二次元图库 - 派次元 API」、h1=「二次元图库」、canonical=`https://t.paiii.cn/gallery`、robots=`index, follow` |
| 瀑布流 | 首屏 **24 张**瓦片、**2** 个标签 chip、**4** 列（1440px 视口 `columnCount=4`） |
| 灯箱 | 点击打开 = true；`ArrowRight` 切换内容 = true；`Esc` 关闭 = true |
| 标签筛选 | 点 `acg` → 发 `GET /api/list?page=1&pageSize=24&tag=acg`；总数 **261 → 259**；再点一次取消，恢复 261 且无激活 chip |
| 加载更多 | 点「加载更多」→ 瓦片 **24 → 48**，发 `GET /api/list?page=2&pageSize=24` |
| `/admin` 直连 | title=「图库管理 - 派次元 API」、首个标题=「图片管理」、robots=`noindex, nofollow` |
| robots.txt | 所有 UA 均含 `Disallow: /admin` |
| sitemap.xml | 仅 `/`、`/docs`、`/gallery`，**无 `/admin`** |
| 质量门 | eslint 通过；`tsc -p tsconfig.app.json` 0 错误；vitest **51/51**；`vite build` 成功（1878 modules；新 chunk：`gallery-browse` 9.91KB、`admin-page` 30.92KB；最大 chunk 仍 `react-vendor` 142KB） |
| 控制台 | **0 报错**（`/gallery`、`/admin` 均无） |

> 排查记录：首轮筛选验证因网络过滤写成 `/api/images`（实际端点是 `/api/list`）而误判为"筛选失效"。修正过滤条件后确认筛选正常，且首屏 6 张重叠只是因为最新图片恰好都带 `acg` 标签 —— 总数变化才是有效判据。

### 12.5 收尾：中文文案一致性（同日补做）

P2 遗留的「首页 H1 英文」已一并处理，并顺手清理了其余面向用户的英文残留：

| 文件 | 原文 | 改为 | 说明 |
|---|---|---|---|
| `HeroSection.tsx` | `anime images` / `for anyone` | `二次元图片` / `人人可用` | 保持原两行结构（第二行走品牌渐变），忠实对译 |
| `test/app-copy.test.ts` | 断言 `"anime images"` / `"for anyone"` | 断言对应 `\uXXXX` 转义 | 沿用该文件既有的转义写法，文件内**不出现原始 CJK** |
| `Footer.tsx` | `Site powered by` | `本站由` | 与同区块「CDN 支持来自」句式统一 |
| `Footer.tsx` | `alt="PAIII Logo"` | `alt="派立方 Logo"` | 中文语境下屏读更准确 |
| `ui/dialog.tsx` | `<span class="sr-only">Close</span>` | `关闭` | 灯箱（及所有 Dialog）的关闭按钮无障碍标签 |

保留不改：`PAIII`（品牌拉丁名）、`application/json`（MIME 类型）、`https://example.com/image.jpg`（示例 URL）、`EdgeOne Logo`（产品名）。

验证：H1 渲染为「二次元图片 / 人人可用」；页脚 `本站由` 命中且无 `Site powered by` 残留；灯箱 `sr-only` 列表含「关闭」；eslint 0 · tsc app 0 错 · vitest 51/51 · `vite build` 1878 modules（最大 chunk `react-vendor` 142KB）· 0 控制台报错。

### 12.6 仍留给后续

- 瀑布流**首次访问**的轻微 CLS（后端返回图片尺寸可根治，属服务端改动）。

---

## 13. 细节打磨（P3）

### 13.1 审计发现

逐文件核查后确认 4 项，其中第 1 项是**真 bug**：

| # | 问题 | 性质 |
|---|---|---|
| 1 | 触摸设备上图片说明（标题/标签）**永远不显示** | 真 bug |
| 2 | 灯箱原图加载期间是一块空白，加载失败也无任何提示 | 体验缺口 |
| 3 | `prefers-reduced-motion` 未覆盖图片卡片的 hover 位移与缩放 | 无障碍缺口 |
| 4 | 图库可翻到 261 张，翻多页后无快捷方式回到顶部改筛选 | 体验缺口 |

**第 1 项的根因**：Tailwind CSS v4 把 `hover:` 变体实现为 `@media (hover: hover) { &:hover }`。触摸设备的 primary pointer 是 coarse，该媒体查询不命中，因此 `group-hover:` 类**在手机上完全不生效**。而 `MasonryTile` 原先的注释写着"移动端常显一层淡渐变保证可读"——注释与实现不符，实现里浮层一直是 `opacity-0`。

### 13.2 改动清单

| 文件 | 改动 |
|---|---|
| `src/features/gallery-browse.tsx` | `MasonryTile` 浮层：加 `pointer-coarse:opacity-100`（触摸常显）；灯箱新增 `status: loading/loaded/error` 三态——加载中转圈、失败给「在新标签页打开」兜底；图片由 `opacity-0` 淡入；`hover:-translate-y-0.5`/`group-hover:scale-[1.03]` 改 `motion-safe:` 前缀 |
| `src/components/sections/GalleryPreview.tsx` | `PreviewTile` 说明条加 `pointer-coarse:opacity-100`；同样改 `motion-safe:` |
| `src/components/ui/back-to-top.tsx` | **新增**。滚动 > 900px 出现，点击回顶；`z-40` 低于弹层 `z-50`，灯箱打开时被遮住；显式判断 `prefers-reduced-motion` 决定 smooth/auto |
| `src/App.tsx` | 挂载 `<BackToTop />`（挂根节点一次，所有长页面共享） |

**取舍说明**：动效降级最初用自定义语义类 `.tile-motion` + CSS 覆盖实现，后改为 Tailwind 内置的 `motion-safe:` 变体——调用点自解释，且不必在 `index.css` 里多维护一组选择器。

### 13.3 验证结果（Playwright 双指针环境实测）

| 场景 | 结果 |
|---|---|
| 桌面（fine pointer） | `pointer:coarse=false`、`hover:hover=true`、说明 `opacity=0`（收在 hover，设计意图保留） |
| 手机 iPhone 13（coarse pointer） | `pointer:coarse=true`、`hover:hover=false`、说明 `opacity=1`、渐变 `opacity=1`（**常显，bug 已修**） |
| 首页图库预览（手机） | 说明条 `opacity=1` |
| 回到顶部 | 深滚动后出现；点击后 `scrollY` 回到 **0** |
| 灯箱 | 图片 `opacity` 由 0 → 1，加载态退出，`figcaption` 正常 |
| 生成 CSS 校验 | `@media (pointer:coarse)`、`@media (prefers-reduced-motion:no-preference)` 均已产出 |
| 质量门 | eslint 0 · tsc app 0 错 · vitest **51/51** · `vite build` 1878 modules（最大 chunk `react-vendor` 142KB） |
| 控制台 | **0 报错** |

> 排查记录：检查产物 CSS 时曾误判"变体没生成"——压缩后媒体查询是 `pointer:coarse`（**无空格**），我按 `pointer: coarse` 去 grep 自然搜不到。断言 CSS 时应兼容压缩格式。

### 13.4 仍保留

- 可选的主色提取（从图片取色延伸品牌色）。

---

## 14. CLS 根因调查与占位比例修正

长期挂在待办里的「瀑布流首访 CLS」，这轮做了完整调查：**先量化，再定位，最后发现根因与最初的假设完全相反。**

### 14.1 先量化：它其实已经达标

用 `PerformanceObserver` 采集 `layout-shift`（排除 `hadRecentInput`），实测：

| 场景 | CLS |
|---|---|
| 桌面 1440×900 | **0.048** |
| 手机 iPhone 13 | 0.044 ~ 0.096 |

Google Core Web Vitals 的阈值是 **good < 0.1** —— 也就是说，这一项**本来就在"良好"范围内**，并不是一个正在伤害用户的缺陷。

### 14.2 定位：真正的根因是「默认占位比例判断反了」

代码里写着：

```ts
/** 二次元图以竖构图居多，3:4 最接近大多数情况 */
const DEFAULT_RATIO = 3 / 4;
```

我对图库真实图片做了两轮采样（逐张 `new Image()` 读 `naturalWidth/Height`）：

| 采样 | 有效样本 | 竖构图 | 横构图 | 中位比例 |
|---|---|---|---|---|
| 第 1 页 20 张 | 16 | 1 | **15** | 1.623 |
| 跨第 1/5/9 页 | 24 | 0 | **24** | 1.778 |

实际尺寸是 `3500×2475`、`3840×2160`、`5000×2813` —— **典型横构图壁纸**，与注释里的"竖构图居多"正好相反。

以不同值做占位的平均绝对偏差：

| 占位比例 | 平均绝对偏差 |
|---|---|
| `0.750`（原值） | **0.989** |
| `1.600` | 0.178 |
| `1.778`（16:9，众数） | **0.064** |

占位框几乎全错 —— 这才是首访时那一下"整块塌缩"的来源。

### 14.3 改动

| 文件 | 改动 |
|---|---|
| `src/features/gallery-browse.tsx` | `DEFAULT_RATIO` 由 `3/4` 改为 **`16/9`**（附采样依据注释）；新增 `SKELETON_RATIOS = [16/9, 3/2, 16/10]`；骨架屏数量由 12 改为 `BROWSE_PAGE_SIZE`（24），与真实首页对齐 |
| `src/App.tsx` | `GalleryFallback` 骨架比例同步改为横构图 |
| `src/components/sections/GalleryPreview.tsx` | 首页精选瓦片 `aspect-[4/3]` → **`aspect-video`（16:9）**，骨架同步 |

### 14.4 结果与结论

- 图库瓦片**盒比例与图片真实比例误差 0.000**（`object-cover` 在比例一致时不裁切）；首页精选瓦片精确 276×155（1.778）。
- CLS 桌面 0.048、手机 0.044~0.096 —— 仍稳定处于 good 区间。
- **判定：不做后端改动。** 要彻底归零必须让 `/api/list` 返回每张图的宽高，需要改 KV 记录结构 + 导入流程 + 存量回填，而收益是把一个已经达标的指标再压一点 —— 成本与收益不成比例。此结论已记入项目记忆，避免以后重复评估。

## 15. P5 图片载荷调查：一个 90% 的体积问题，以及一个前端解决不了的边界

CLS 达标后，这一轮转向真正在伤害体验的指标：**LCP**。结论是——图库页的 LCP 不在前端手里。

### 15.1 先说方法论：两个必须避开的测量陷阱

这轮返工了三次，都是量法错了，记下来避免重犯。

| 陷阱 | 现象 | 正确做法 |
|---|---|---|
| **跨域资源取不到字节数** | 图片来自 `img.static.paiii.cn`，未返回 `Timing-Allow-Origin`，Resource Timing 的 `transferSize/encodedBodySize` **一律为 0** | 改用 Playwright 的 `page.on('response')` 读原始 `content-length`；或落盘 `curl` + `wc -c` |
| **拿 dev server 测性能** | dev 模式 Vite 不打包，87 个模块走限速连接，**DCL 高达 7 秒**，LCP 竟落到 `index.html` 的加载占位文字上 | 必须 `npm run build` 后 `vite preview` 测生产产物（DCL 回到 ~420 ms） |

另外一个坑：LCP 采集窗口必须长于"下完整页图片"的时间，否则测到的是截断值。4G 下 9.3 MB ≈ 19 s，所以窗口取 26 s——**窗口 6 s 时读数是 6.3 s，窗口 26 s 时读数是 8.2 s**，前者是假的。

### 15.2 实测：图库首屏的图片重量

生产产物 + 4G 限速（4 Mbps / RTT 40 ms），零滚动：

| 场景 | 首屏图片 | 首屏图片体积 | 占全站传输 |
|---|---|---|---|
| 图库 · 桌面 1440 | 24 张 | **9.27 MB** | 72% |
| 图库 · 手机 iPhone 13 | 12 张（慢 3G）/ 24 张（4G） | 3.5 ~ 9.3 MB | 72% |
| 首页 · 手机 | 4 张（懒加载生效） | **0.73 MB** | 17% |

单张平均 **395 KB**，最重 **1362 KB**。而它们的**真实尺寸是 `5760×3240`、`5000×2813`、`3840×2160` 这类壁纸原图**，显示槽位却只有：

| 断点 | 瓦片宽度 | 瓦片高度 | 过度供给 |
|---|---|---|---|
| 桌面 1440（4 列） | 264 px | 149 ~ 373 px | 约 10 倍（线性） |
| 手机 390（2 列） | 173 px | 97 ~ 245 px | 约 15 倍（线性） |

**首屏 24 张里没有一张是按显示尺寸提供的**——这就是 9.27 MB 的来源。

### 15.3 LCP 实测：坏在图片，且不是"某一张"的错

| 场景 | LCP | LCP 元素 |
|---|---|---|
| 图库 · 桌面 4G | **8226 ms** | `<IMG>`（264×159，面积 42091） |
| 图库 · 手机 4G | **10029 ms** | `<IMG>`（173×94，面积 16298） |
| 首页 · 手机 4G | **589 ms** | `<SPAN>` 文字「人人可用」 |

Good 阈值是 2.5 s，Poor 阈值是 4 s —— 图库页的 LCP 已进入 **Poor**。

关键观察：**LCP 元素不是第一张瓦片，而是"后到达的某张更高的图"**。因为 24 张图同时抢一条 4 Mbps 的管道，谁后到、谁更高，带有随机性；LCP 会持续被更晚到达的更大图刷新。这意味着**针对单张图做优先级是无效的**（见 15.5）。

### 15.4 根因：托管方没有开启图片处理

我按各家厂商的语法逐条实测了缩略图参数，**全部返回原图字节，md5 完全一致**：

| 语法 | 归属 | 结果 |
|---|---|---|
| `?imageMogr2/thumbnail/600x` | 腾讯云数据万象 / EdgeOne | 169578 B（= 原图） |
| `?imageMogr2/thumbnail/!600x` | 同上 | 169578 B |
| `?imageMogr2/thumbnail/600x/format/webp` | 同上 | 169578 B |
| `?imageMogr2/crop/600x400` | 同上 | 169578 B |
| `?imageView2/2/w/600` | 七牛 | 169578 B |
| `?x-oss-process=image/resize,w_600` | 阿里云 OSS | 169578 B |

托管方识别：响应头带 `EO-Cache-Status` / `EO-LOG-UUID` → **腾讯云 EdgeOne**，源站路径 `imgtcpaiii/...` 形似同名 COS 桶。参数被当作普通 query 透传，说明**图片处理能力未开通**（EdgeOne 图片处理是需在控制台开启的增值能力，COS 侧则对应数据万象）。

### 15.5 收益量化：这一项是 90%，不是 10%

把真实第一页 24 张原图下载下来，按 **宽度 600 px、WebP q80**（覆盖桌面 264px @2x）本地重编码，逐张实测：

| 指标 | 原图 | 600px WebP q80 | 降幅 |
|---|---|---|---|
| 合计 | **9.27 MB** | **0.88 MB** | **−90.5%** |
| 平均单张 | 395 KB | 38 KB | — |
| 最重单张 | 1362 KB（`5000×2813`） | 47 KB | **−96.6%** |

极端个案：`5760×3240` 的 837 KB 原图可压到 **39 KB（−95.4%）**。也就是说，**9.27 MB 的首屏里，真正有用的信息量大约是 0.88 MB**——其余 8.4 MB 是分辨率冗余。

### 15.6 本轮落地的改动

| 文件 | 改动 | 效果 |
|---|---|---|
| `index.html` | 新增 `preconnect` + `dns-prefetch` 到 `img.static.paiii.cn` | 图片请求要等 React 挂载 + `/api/list` 返回后才发出，提前握手把这部分时间省掉 |
| `src/features/gallery-browse.tsx` | `MasonryTile` 支持 `priority`，仅第一张用 `loading="eager"` + `fetchpriority="high"` | 保证首张可视图不被懒加载启发式延后 |

**一个必须记录的负面结论：给单张图加优先级并不能修 LCP。** 实测改动后 LCP 仍为 8.2 s / 10.0 s，因为 LCP 元素是随机后到的大图，不是瓦片[0]。

顺带纠正一个很容易写错的直觉：**CSS multi-column 是逐列向下填充的，DOM 顺序 ≠ 视觉首屏顺序**。实测桌面 4 列时 DOM `0,1,2,3,4` 全部落在第 1 列；首屏 15 张瓦片的起点索引是 `0, 5, 11, 18`；手机 2 列时首屏只有 `0, 1, 11, 12`。所以"给前 N 张加优先级"这种写法会把首屏外的图提到前面，**是错的**。

### 15.7 结论与待决策

**前端侧已到边界。** 载荷问题无法在前端解决：图片不可缩放，就没有任何前端技巧能把 9.27 MB 变成 0.88 MB。

三条路，按 ROI 排序：

| 方案 | 成本 | 收益 | 备注 |
|---|---|---|---|
| **A. 在 EdgeOne / COS 开启图片处理** | 控制台开通（按量计费增值项） | 9.27 MB → **0.88 MB**，LCP 预计 8.2 s → ~1.5 s | 开通后前端只需在 URL 拼 `?imageMogr2/thumbnail/800x/format/webp/quality/80`，约 1 行改动 |
| **B. 导入流程生成派生图** | 改后端 + 存量回填 | 同 A | 不依赖云厂商增值服务，但要承担存储与改造 |
| **C. 移动端第一页 24 → 12 张** | 1 行常量 | 首屏图片 9.27 MB → ~4.6 MB，LCP 改善但仍在 4~5 s | **纯前端兜底**，代价是多点一次「加载更多」。属产品取舍，待确认 |

明确不做：**第三方图片代理**（如 weserv.nl）。它技术上可行，但给一个面向国内用户的站点引入境外第三方中转，会带来可达性、限流与长期存续风险，不划算。

---

*本规划基于对 `G:\web\tcapi` 源码的逐文件核查，以及两轮设计决策问答。所有"现状"描述均可在对应文件中验证。*

