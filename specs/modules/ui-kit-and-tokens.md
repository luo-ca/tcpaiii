---
id: tcapi-mod-ui-kit
type: module-design
status: active
title: UI 组件与设计令牌
parent: tcapi-architecture
tags: [frontend, design-system, css]
---

# UI 组件与设计令牌

`src/index.css`（令牌与工具类）+ `src/components/ui/*`（基础组件）+
`src/components/states/*`（空态/错误态）+ `src/components/layout/*`。

## Responsibility

### 设计令牌（`index.css` 的 `@theme inline`）

唯一色源是品牌 Logo（`#007AFF → #5856D6`）：

- `brand-*`（iOS systemBlue 系）与 `iris-*`（systemIndigo 系）是**仅有的两个色相**。
- 中性色：暖纸白底 `#f8f7f3`、纯白卡面、墨色 `#15171f`（文字与描边同源）。
- 语义色成组出现：`destructive` / `success` / `warning` 各有
  `-soft`（底）/ `-line`（边）/ `-ink`（文字）三档。
- 阴影三档 `sm/md/lg` 只留给必须浮起的层；主体用「贴纸硬投影」
  （无模糊、纯实色偏移），由 `.glass*` 工具类提供。

### 视觉语言

- `.glass` / `.glass-strong` / `.glass-card`：白底 + 2px 墨线 + 硬投影。
  名字沿用历史（原是玻璃拟态），**实现已无任何 `backdrop-filter`**。
  `.glass-card` 悬停时向左上抬起 2px、投影拉长到 6px。
- `.reveal`：CSS scroll-driven animation（`animation-timeline: view()`），
  只在支持该特性的浏览器生效，且尊重 `prefers-reduced-motion`。
  只能加在**不带 hover transform 的容器**上。
- `.hero-enter`：首屏分阶段入场，**只动 transform 不动 opacity**，
  避免推迟 LCP。
- `.ambient-gradient`：漫画网点底纹（`radial-gradient` + mask 渐隐）。
- `.skeleton-shimmer`：加载骨架；`.stat-value`：数字入场。

### 组件

| 组件 | 说明 |
| --- | --- |
| `button` / `input` / `label` / `card` / `badge` / `tabs` / `select` / `dialog` / `alert-dialog` | 基于 Radix + CVA 的 shadcn 风格封装 |
| `nav-link` | 站内链接，走 `navigate()` 而非 `<a href>` 全量刷新 |
| `tag-chip` | 标签胶囊，两种尺寸 |
| `masonry-tile` | 瀑布流瓦片（`memo`），首页与图库共用 |
| `image-lightbox` | 灯箱：键盘左右切换、触摸滑动、相邻预取、加载/失败兜底、焦点归还 |
| `back-to-top` | 滚动到顶 |
| `states/EmptyState` / `states/ErrorState` | 空态与错误态，容器保持中性墨线卡 |

## Boundary

组件只消费令牌与 `lib/utils.ts` 的 `cn()`，不直接写十六进制色值。
新色相一律不引入 —— 图片是页面上唯一的多彩来源。

## Invariants

1. **`--header-h` 是顶栏高度的唯一来源**：`64px`，`<768px` 时 `96px`。
   页面用 `pt-[calc(var(--header-h)+Npx)]` 让位，不写死像素。
2. **`ErrorState` 的容器上不要再挂 `border-<色>` 工具类**：`.glass-strong` 的
   `border` 简写在产物 CSS 中排在 Tailwind 工具类之后，会把边框色工具类
   盖成永不生效的死类。错误信号由内层图标容器与 `role="alert"` 承担。
3. **`ErrorState` 自己接管重试的进行中状态**：`onRetry` 的三个调用方签名都是
   `() => void`，返回值被丢掉；组件内部统一禁用并显示「重试中…」。
4. **`MasonryTile` 的 `priority` 只给第一张**。CSS multi-column 逐列向下填充，
   DOM 里 index 0~3 会同处第一列；写成「前 N 张优先」会把首屏外的图提到前面。
5. **`ImageLightbox` 必须自己记录并归还焦点**：它用受控 Dialog 且**没有**
   `DialogTrigger`，Radix 归还焦点时只知道 trigger，取不到就退回 `body`。
   记录在渲染期完成（Radix 搬移焦点在 commit 之后）。
6. **瓦片占位比例默认 16:9**（`DEFAULT_RATIO`）。实测图库样本中位比例 ≈1.75、
   众数 16:9；误用 3:4 会让占位框几乎全错，图片到达时整块塌缩。
7. **`.reveal` 不能加在带 hover transform 的容器上**：动画 `fill both` 会持有
   最终 `transform`，覆盖 hover 位移。
8. **`@source not` 排除文档与测试目录**：Markdown 里作为验收标准写下的类名
   会被当成真实使用编译进产物，既白占体积，也让「产物里搜不到」的检查出现假阳性。

## Notes

`src/lib/image-ratio.ts` 为瓦片提供「上次见过的宽高比」缓存（内存 + `localStorage`，
上限 500 条，1 秒防抖写盘）。接口不返回宽高，这是瀑布流 CLS 的兜底手段；
根治需要 `/api/list` 带尺寸字段。
