---
id: tcapi-mod-gallery-browse
type: module-design
status: active
title: 公开图库页
parent: tcapi-architecture
tags: [frontend, gallery, infinite-scroll]
---

# 公开图库页

`src/features/gallery-browse.tsx`，路由 `/gallery`。无限滚动浏览 + 标签/关键词筛选 +
就地灯箱。

## Responsibility

- 用 `useInfiniteQuery` 分页拉 `/api/list`，每页 24 张（`BROWSE_PAGE_SIZE`）。
- 筛选状态（`q` 关键词、`tag` 标签）与地址栏双向同步，可分享、可刷新、可后退。
- 网格用 CSS multi-column 瀑布流，瓦片 `MasonryTile`（与首页共用）。
- 点瓦片就地开 `ImageLightbox`，左右键切换、走到末尾自动续加载下一页。

## Boundary

- 依赖 `fetchImagesPage` / `statsQueryOptions`（[[tcapi-mod-api-client]]）、
  `readGalleryQuery` / `writeGalleryQuery`（[[tcapi-mod-api-client]] 的地址层）、
  `MasonryTile` / `ImageLightbox` / `TagChip`（[[tcapi-mod-ui-kit]]）。
- 首帧直接用 `window.location.search` 取初值，避免「先渲染整库、再跳成筛选结果」的闪动。

## Invariants

1. **合页后按 id 去重**。offset 分页在两次请求之间若被插入新图，第 2 页会重复
   第 1 页末尾几张。React 不会因此报错（key 由瓦片内部生成），只能靠去重挡住。
2. **头部「共 N 张」取最后一页的 `total`**，不是 `pages[0].total`。
   图库在浏览期间被改动时，首访快照会与已渲染数量自相矛盾。
3. **底部文案用「已加载 N 张」而非「共 N 张」**：头部讲库存、底部讲进度，
   去重后两者本就可以不等，两个「共」字会让用户以为页面出错。
4. **错误态分两层**：首屏失败（无数据）显示整块 `ErrorState`；
   续加载失败只在「加载更多」附近就地提示 + 重试，**不动已渲染的网格**。
5. **筛选条件一变就收起灯箱**。`keepPreviousData` 会在切换瞬间把旧结果留在
   `images` 里，旧索引仍「合法」但指向完全不同的图。
6. **灯箱索引越界的三种分支必须分开**：确实在拉下一页 → 保留占位；
   拉失败 → 保留占位并给重试 UI；不在拉也没失败 → 回退到最后一张。
   否则「第 2 页整页都是已有项」时占位态永不解除，弹窗卡死。
7. **筛选写回地址栏用 `replaceState`**，不是 `pushState` —— 否则每敲一个字
   都进历史，后退键变成「逐字回退」。
8. **搜索词先剔控制字符再 trim**：粘贴进来的 NUL 不可见，只 trim 会造出
   「输入框看着是空的、页面却一直在筛选」的假空结果态。
9. **搜索框与筛选清空是两个独立动作**：清搜索词的按钮只清关键词，
   不连带清标签。

## Notes

分页模型本身的重叠无法在服务端消除（无状态、不知道客户端拿过什么）。
换 cursor 分页能根治，但那是更大的改动，当前按「同一个 id = 同一张图」收敛。
