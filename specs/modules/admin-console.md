---
id: tcapi-mod-admin
type: module-design
status: active
title: 管理后台
parent: tcapi-architecture
tags: [frontend, admin, crud]
---

# 管理后台

`src/features/admin-page.tsx` + `src/features/admin/*`，路由 `/admin`（noindex）。

## Responsibility

| 文件 | 职责 |
| --- | --- |
| `admin-page.tsx` | 密钥卡、统计卡、搜索/标签筛选、分页、选择模式、删除 mutation |
| `admin/add-image-dialog.tsx` | 单张添加 / 批量导入（含去重预检、字节预检、逐条失败清单） |
| `admin/edit-image-dialog.tsx` | 单张编辑（URL / 标题 / 标签） |
| `admin/batch-update-tags-dialog.tsx` | 批量增删标签 |
| `admin/image-card.tsx` | 单卡：懒加载图、复制、编辑、删除确认、勾选 |
| `admin/use-lazy-image.ts` | IntersectionObserver 懒加载（`rootMargin: 400px`） |
| `admin/delete-gate.ts` | 删除去重闸门（按 id 的 `Set`） |

## Boundary

密钥只存在于组件 state（`adminToken`），刷新即失效，不写 `localStorage`。
所有写操作前经 `onRequireToken()`：已验过直接放行，否则打一次
`/api/admin/verify`。

`refreshGallery()` 是写操作后的统一失效入口，一次作废五个查询键：
`['images']`、`['stats']`、`['hero-image']`、`['all-image-urls']`、`['gallery-preview']`。
漏掉任何一个都会让首页或导入预检拿着旧数据 —— 删掉的图会在首页继续挂到
`staleTime` 到期。

## Invariants

1. **「图片总数」只信 stats**。`stats` 未就绪时显示 `—`，绝不回退到
   `imagesQuery.data.total` —— 那是**筛选结果数**，把它当全库总数会让
   「搜不到任何结果」显示成「图片总数 0」，管理员第一反应是数据丢了。
2. **「空库」判据必须是全库为空**。`stats` 拿不到时不显示空库态
   （少一个提示好过给一个错的）；只有 stats 成功且 `totalImages === 0` 才算空库。
3. **删除去重闸门在 mutation 层**。Radix 的 `AlertDialogAction` 先关弹窗再跑
   `onClick`，而 `onClick` 里还有一段 `await onRequireToken()` —— 从弹窗关闭到
   `mutationFn` 启动之间 `isDeleting` 仍是 false，用户能再确认一次。
   禁用触发器堵不住这个窗口，必须在 mutation 层按 id 去重。
4. **删除成功后按 id 从选择集里摘掉**，不是整体清空：其它勾选仍有效，
   而残留的已删 id 会在批量提交时制造「未命中（可能刚被删除）」的假失败。
5. **筛选/翻页/每页数一变就清空选择**：勾选跨页保留，但对着另一批图提交
   上一批的选择是静默的错误。
6. **守卫在 `await` 之前置位**：所有提交路径先 `setLoading(true)` 再
   `await onRequireToken()`，`finally` 归还。否则密钥校验的网络往返期间
   按钮可点，连点会让同一批图导入两遍。
7. **密钥校验带请求序号**（`tokenCheckSeqRef`）：改密钥、清除密钥、再次点校验
   都递增；过期响应回来时序号对不上就作废，不把状态误写成「已验证」。
8. **分页页码对齐只在真实数据上做**：`isPlaceholderData` 为 true 时
   `data.page` 还是旧页号，据此回写会把刚翻到的页码弹回去。
9. **每页张数选项必须 ≤ 后端 `MAX_LIST_PAGE_SIZE`**：服务端是静默夹取，
   选「96」实际只拿到 60，界面与真实条数会悄悄对不上。
10. **批量标签冲突前端拦截**：同一标签同时出现在「添加」和「删除」里时，
    服务端先删后加、最终保留 —— 与用户在删除框里的意图相反。除了 toast，
    还要给一条常驻可见提示并禁用提交。
11. **图片懒加载的 `eager` 由位置决定，但必须能独立取源**：卡片按 `img.id`
    复用，筛选/删除后次屏外的卡会被挪到 `index < 6`，此时 observer 已断开、
    `eager` 分支不再重挂。所以 `activeSrc` 看 `eager || state !== 'idle'`，
    而不是只看 state。

## Notes

`delete-gate.ts` 抽成独立模块有两个理由：逻辑可被真实行为测试驱动（而不是靠
源码正则断言），以及 `admin-page.tsx` 只导出组件以避免
`react-refresh/only-export-components` 警告。

统计卡网格用 `grid-cols-[repeat(auto-fit,minmax(144px,1fr))]` 而不是写死三列：
`minmax(144px,1fr)` 保证文字可用宽度 ≥ 最宽内容，`auto-fit` 让空间不足时
自动降两列/一列。
