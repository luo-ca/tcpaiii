---
id: tcapi-mod-edge-dispatch
type: module-design
status: active
title: 边缘函数分发层
parent: tcapi-architecture
tags: [backend, edge, routing]
---

# 边缘函数分发层

## Responsibility

`edge-functions-src/api/\[\[default\]\].ts` 是 `/api/*` 的唯一入口。它**只做分发**，
不承载业务逻辑：方法校验、CORS 预检、限流、鉴权前置、统一异常兜底，
业务实现全部在 `edge-functions-src/lib/*`。

路由表（方法与路径的完整对应）：

| 方法 | 路径 | 鉴权 | 限流 | 处理器 |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | — | — | 内联（runtime/buildId/kv 绑定） |
| GET | `/api/random` | — | 是 | `handleRandomImage` |
| GET | `/api/list` | — | — | `handleListImages` |
| GET | `/api/stats` | — | — | `handleStats` |
| GET | `/api/admin/verify` | 是 | 是（失败计数） | `handleAdminVerify` |
| POST | `/api/create` | 是 | 是（失败计数） | `handleCreateImage` |
| PUT | `/api/update/:id` | 是 | 是（失败计数） | `handleUpdateImage` |
| DELETE | `/api/delete/:id` | 是 | 是（失败计数） | `handleDeleteImage` |
| POST | `/api/batch` | 是 | 是（失败计数） | `handleBatchCreateImages` |
| POST | `/api/batch-update` | 是 | 是（失败计数） | `handleBatchUpdateImageTags` |

`OPTIONS` 在路由表之前统一处理，返回 `no-store` + CORS 头、无 body。
路径未命中任何分支时返回 `404 {"error":"Not Found"}`；方法不匹配返回 `405`。

`:id` 段经 `decodeRouteSegment` 解码，解码失败或未通过 `isValidImageId` 时返回 `400`。

## Boundary

**输入**：`Request` + 运行时注入的 `runtimeEnv`（KV 绑定与密钥）+ 可选
`ExecutionContextLike`（提供 `waitUntil`）。对外导出两个形状：

- `default onRequest(context: EdgeOnePagesContext)` —— EdgeOne Pages 调用它。
- 具名 `handler.fetch(request, runtimeEnv, executionContext)` —— 单测直接驱动。

**输出**：`Response`。所有 JSON 响应统一经 `lib/response.ts` 的 `json()` 构造，
因此必定带 `content-type: application/json`、`X-Content-Type-Options: nosniff`
与 CORS 头。

**异常边界**：整个 `fetch` 包在单个 `try/catch` 里。任何 handler 抛出的异常都在
这里被收成 `500 {"error":"Internal Server Error","buildId":...}`，并 `console.error`
记录。`buildId`（`API_BUILD_ID`）回显是为了让线上排障能确认跑的是哪份产物。

**不负责**：不解析请求体（各 handler 用 `readJsonBody` 自行读一次）、
不校验字段、不碰 KV。

## Invariants

1. **限流只在 `/api/random` 上**：模块级滑动窗口，1 秒 100 次，超限 `429` +
   `Retry-After: 1`。计数在进程内存里，多实例不共享 —— 它挡的是单实例的滥用，
   不是全局配额。
2. **鉴权先于业务**：所有写路由在调用 handler 之前先 `verifyAdminRequest`，
   非 null 直接返回该错误响应。`/api/admin/verify` 自己走同一条鉴权再回 `{ok:true}`。
3. **`/api/health` 不读 KV、不计入 stats**。它的 `kv` 字段来自 `getKvHealth()`，
   只探测绑定是否存在，因此状态页轮询不会污染调用量。
4. **`resetRuntimeCaches()` 只服务于测试**：一次清空图库缓存、统计缓存与鉴权失败表，
   保证用例之间不串味。

## Notes

`/api/random` 的统计写入不在分发层处理 —— 它由 `handleRandomImage` 自己用
`waitUntil` 投递，见 [[tcapi-mod-stats-auth]]。分发层只保证 `executionContext`
被透传下去。
