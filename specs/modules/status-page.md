---
id: tcapi-mod-status-page
type: module-design
status: active
title: 服务状态页
parent: tcapi-architecture
tags: [frontend, observability]
---

# 服务状态页

`src/features/status-page.tsx`，路由 `/status`。给「接口挂了？」的访客一个
不用翻文档就能自证的入口：健康检查 + 存储绑定 + 自助延迟测速。

## Responsibility

- 每 30 秒轮询 `/api/health`（标签页隐藏时停表，切回立即复检）。
- 把「服务到底活着没」收敛成一个 `Overall` 判别联合：
  `loading` / `down` / `degraded` / `ok`，由 `deriveOverall` 单点推导。
- 横幅 + 三张卡（服务 / 存储绑定 / 调用延迟自测）。
- 「复制摘要」把总状态、运行时、构建版本、KV 绑定、延迟与页面地址拼成一段
  可直接贴给对方的文本。

## Boundary

- `fetchHealth` 与 `measureRandomLatency` 来自 [[tcapi-mod-api-client]]。
- 健康检查路径**不写 KV、不计入 stats**，因此轮询不消耗调用量。

## Invariants

1. **`deriveOverall` 是唯一判据**。横幅、逐项卡、摘要全部基于它，
   不在各处各写一套判断。
2. **降级要说清缺哪个绑定**：`degradedNote` 列出具体缺失项
   （「图库 (images) 与 统计 (stats) 未绑定」），而不是笼统的「存储绑定不完整」。
3. **测速状态用判别联合，不用 `number | null` 兼表两义**。
   `idle` / `testing` / `ok` / `failed` 四态一一对应文案，
   `'测速失败'` 这个字面量只在真实失败时出现。
4. **只有真实测量值进摘要**：`testing` 与 `failed` 都不冒充一次测量结果。
5. **骨架高度与真实内容一致**：横幅窄屏 123px / ≥sm 79px；「服务」卡 3 行、
   「存储绑定」卡 2 行。行数不符会让卡片在数据到达时缩短，把下方内容上提。
6. **`latencyTone` 三档**：< 300ms 绿、< 800ms 黄、其余红。
7. **测速请求必须带超时**：`measureRandomLatency` 自带 `AbortSignal.timeout`，
   否则边缘挂住时按钮永久禁用、界面永远「测速中…」。

## Notes

`/api/health` 的 `kv` 字段是「绑定是否存在」的探测结果，不是「读写是否可用」。
状态页的文案据此写成「未绑定，读写可能受影响」，而不是断言服务已挂。
