---
id: tcapi-mod-api-client
type: module-design
status: active
title: 前端数据访问层
parent: tcapi-architecture
tags: [frontend, data, http]
---

# 前端数据访问层

`src/lib/api-client.ts`（传输）+ `src/lib/api.ts`（领域函数）+ `src/lib/url.ts`
（地址构造与筛选状态序列化）。

## Responsibility

### 传输层（`api-client.ts`）

`apiRequest<T>(input, init, fallback, { bustCache })` 是全站唯一的 HTTP 出口：

1. **补预览参数**：预览链接（`?eo_token=…`）上每个请求都必须带这组参数，
   否则请求打到线上部署 —— 管理员一次「添加图片」会写进生产库。
2. **超时兜底**：`AbortSignal.timeout(15_000)`。调用方自带 `signal` 时不覆盖。
3. **破缓**：`bustCache` 默认 `true`，GET 加 `_t=<now>` 且 `cache: 'no-store'`；
   幂等读接口（stats、分页 list）显式传 `false`，交给服务端的
   `s-maxage=10, stale-while-revalidate=30` 说话。
4. **错误归一化**：非 2xx 时读 body，JSON 取 `error`/`message` 过
   `translateServerError`；HTML 与非 JSON 给带摘要的中文提示。
   取值处**取第一个非空字符串**（先 `error` 后 `message`）：字段类型不对
   （`{ error: 42 }`）时跳过它继续看 `message`，两者都不可用时才回退调用方 fallback。
   不能让 `translateServerError` 抛错再被兜底成「接口返回了非 JSON 内容」——
   那是合法 JSON，误报会把排查引向错误方向。也不能写成 `error || message`：
   数字是真值，会把后面那条合法的 `message` 一起丢掉。
5. **JSON 解析**：先读文本再 `JSON.parse`，失败时能用原文拼出「接口返回了非 JSON 内容（…）」。

`translateServerError` 是一张正则表，把后端英文错误（`Invalid admin token`、
`URL already exists`、`Request body exceeds N bytes` …）译成中文；
映射不到的原样返回（不吞信息）。逐条 `results[].error` 也过同一张表。

### 领域层（`api.ts`）

| 函数 | 端点 | 关键点 |
| --- | --- | --- |
| `fetchRandomImage` | `/api/random?format=json` | 带 `exclude` 防连点撞同一张 |
| `fetchHealth` | `/api/health` | `no-store`，缺 `kv` 时按未绑定归一化 |
| `measureRandomLatency` | `/api/random` | `redirect: 'manual'`，独立超时 |
| `fetchStats` | `/api/stats` | 不破缓；`tags`/`dailyRequests` 逐项校验 |
| `statsQueryOptions` | — | `['stats']` 单点定义，15s 轮询 + 聚焦重取 |
| `fetchImagesPage` | `/api/list?...` | 兼容裸数组与分页对象两种形状 |
| `fetchExistingImageUrlSet` | `/api/list` | 供批量导入去重预检 |
| `verifyAdminToken` | `/api/admin/verify` | Bearer |
| `createImage` / `updateImage` / `deleteImage` | CRUD | Bearer + JSON |
| `batchCreateImages` / `batchUpdateImageTags` | `/api/batch*` | 结果归一化 + 前端上限预检 |

### 地址层（`url.ts`）

- `buildApiPath` / `buildAppUrl`：拼当前 origin 并补预览参数。
- `readGalleryQuery` / `writeGalleryQuery`：图库筛选状态与查询串的纯函数互转。
  写回时**以现有查询串为起点增删**，不重建 —— 否则 `eo_token` 会被抹掉。
  两侧必须过同一套清洗（`sanitizeQueryValue`：剔控制字符 + trim，纯空白等于
  「没有该筛选」），否则地址栏里的条件与请求实际带的条件会分裂；长度只由读侧
  收口，写侧不重复截断。

## Boundary

调用方（页面、区块、对话框）只认领域函数的返回值类型，不处理 HTTP 细节。
响应形状不合约时，由**这一层**抛一条人能看懂的错误，而不是把 `TypeError` 透给 UI。

## Invariants

1. **形状守卫在边界收口**。所有从网络来的数据都要过一遍运行时校验，
   最低形状不合格就丢弃而不是放行：
   - `isImageRecord`：`id`/`url`/`title` 是字符串、`tags` 是字符串数组
     （连**元素**也要查，`[{bad:1}]` 会让 React 抛错并打崩整页）。
   - `fetchStats`：`tags` 过滤非字符串、`dailyRequests` 逐值是有限数字、
     计数字段非有限数回退 0。
   - `fetchImagesPage`：数字字段必须有限且满足最小值，页码/页大小必须是正整数；
     `totalPages` 至少 1，`page` 夹到 `totalPages`。
   - `normalizeBatchResult`：`results` 必须是数组且每项 `success` 是布尔；
     每条 `url` 收成字符串、`error` 过中文化。
2. **`fetchHealth` 永不抛形状错误**：缺字段按「未绑定」归一化。状态页是
   「服务挂了时用户来看」的页面，它自己崩掉是最糟的结果。布尔字段（`ok`、
   `kv.imagesBound` / `kv.statsBound`）只认真正的 `true` —— `Boolean("false")`
   是 true，把服务端脏值读成健康会让该报警的页面显示一切正常。
3. **预览参数是硬契约**，`_t` 破缓只管 GET —— 两者正交，不可互相替代。
4. **批量上限前端预检**：`batchUpdateImageTags` 在发请求前拦 `ids.length > 500`，
   并说清「已选 N 张 / 上限 M 张」；批量导入同时查条数与序列化字节数
   （两个上限是乘法关系，见 [[tcapi-mod-quality-gate]] 的常量一致性）。
5. **`measureRandomLatency` 必须自带 `signal`**：它刻意不走 `apiRequest`
   （`redirect`/`cache` 语义独有），因此继承不到 15s 兜底。没有它，边缘挂住时
   状态页会永久停在「测速中…」，按钮永久禁用。

## Notes

`withNoCacheQuery` 与 `appendPreviewParams` 是两条独立的 URL 加工路径，
前者管 `_t`、后者管预览参数。字符串、`URL`、`Request` 三种输入都要支持 ——
`Request` 分支重建对象时保留原 body 与 headers。
