---
id: tcapi-mod-home
type: module-design
status: active
title: 首页区块
parent: tcapi-architecture
tags: [frontend, home, sections]
---

# 首页区块

`src/components/sections/*`，由 `App.tsx` 的 `HomePage` 依次组合：
`HeroSection` → `OnlinePreview` → `GalleryPreview` → `RealtimeStats` →
`WhyChoose` → `DocsTeaser` → `ImageSubmission` → `Changelog`。

## Responsibility

| 区块 | 数据来源 | 职责 |
| --- | --- | --- |
| `HeroSection` | `/api/list?pageSize=1` + stats | 首屏主视觉、标签搜索框、统计徽章、复制 API 地址 |
| `OnlinePreview` | `/api/random?format=json` + stats | 随机图预览、换一张、复制地址/API 地址、标签筛选 |
| `GalleryPreview` | `/api/list?pageSize=8` | 最新收录 8 张，就地开灯箱 |
| `RealtimeStats` | stats | 四张统计卡 + 近 7 天柱状趋势 |
| `WhyChoose` / `DocsTeaser` / `ImageSubmission` / `Changelog` | 静态内容 | 卖点、文档入口、投稿、更新日志 |

`ApiDocsSection` 与 `SecurityFeatures` 属于 `/docs` 页，见
[[tcapi-mod-app-shell]] 的 `DocsPage`。

## Boundary

**跨区块契约**：`HeroSection` 通过 `onRequestRandom(tag?)` 回调向上冒泡，
`HomePage` 把它转成递增 `token` 的 `RandomRequest` 传给 `OnlinePreview`，
同时把预览区块滚入视口。不再用 `document.getElementById` + `CustomEvent` 广播。

**首屏主视觉**：走 `/api/list`（公开读、不写统计），取第一张图的 URL；
失败时保留品牌渐变，**绝不回退到第三方文生图接口**（历史上那个地址只会返回
「image is generating」占位图）。失败要抛出而不是吞成空串 —— 空串会被当作
成功结果按 `staleTime` 钉住 5 分钟，而全站关闭了 `refetchOnWindowFocus`。

**在线预览的请求竞态**：每次 `shuffleImage` 递增 `requestIdRef`，响应回来时
序号不匹配就丢弃。`lastImageIdRef` 作为 `exclude` 传给后端，保证「换一张」
在同标签还有别的图时不撞回上一张。

**统计刷新**：换图成功后只 `invalidateQueries({ queryKey: ['stats'], refetchType: 'none' })`
—— 标脏但不立即重取。默认的 invalidate 会当场再打一次 `/api/stats`，
实测连点 5 次「换一张」会多出 5 次多余请求。

## Invariants

1. **统计行加载中占位**：`HeroSection` 的统计徽章在 `statsPending` 时渲染同构骨架，
   数量/图标/内边距与真实值一致，只把数字换成等宽骨架块 —— 否则数据到达时
   左栏高度突增会推走整段内容。
2. **零数据不摆零**：Hero 徽章与 `RealtimeStats` 在「真的没有数据」时整块不渲染；
   `RealtimeStats` 在「拉取失败」时保留一条 `role="alert"` 轻提示，
   避免与「统计为 0」同形。
3. **图片加载必须有超时兜底**（20s）：`OnlinePreview` 与 `ImageLightbox` 都不依赖
   `<img>` 一定触发 `onLoad`/`onError`。200 但零字节、被中间层截断、解码挂起
   都会让骨架永久盖在图上，而且加载态下按钮是禁用的 —— 用户连重试都点不了。
4. **状态灯三态**：`error` / `loading` / `ready`，不能只按 `imageLoading` 判断
   （出错后 `imageLoading=false` 会让红灯面板旁边亮绿灯）。
5. **`RealtimeStats` 的日期按 `STATS_TIME_ZONE` 渲染**，与后端分桶同一时区。
6. **`GalleryPreview` 在真空库时整段收起，拉取失败时不收起** —— 后者保留区块
   与重试入口，免得接口抖动时首页区块凭空消失。
7. **可访问性**：换图后给读屏一条 `aria-live="polite"` 播报当前图片标题；
   所有装饰性图标 `aria-hidden`。

## Notes

标签筛选条（`category-strip`）在窄屏横向滚动 + snap，`sm` 起换行。
`OnlinePreview` 的标题底色锚在内容盒自身（`bg-black/70` + `before:` 渐变补边），
不锚在图片底部渐变上 —— 后者在纯白图 + 多行标签时会掉到 1.57:1 的对比度。
