---
id: tcapi-mod-gallery-api
type: module-design
status: active
title: 图库领域接口
parent: tcapi-architecture
tags: [backend, crud, api]
---

# 图库领域接口

`edge-functions-src/lib/images.ts`。随机取图、分页列表、增删改与两个批量接口。

## Responsibility

| 处理器 | 路由 | 行为要点 |
| --- | --- | --- |
| `handleRandomImage` | `GET /api/random` | 302 到图床，或 `format=json` 返回记录 |
| `handleListImages` | `GET /api/list` | 无参回裸数组；有参回分页对象 |
| `handleCreateImage` | `POST /api/create` | 单张新增，URL 重复返回 409 |
| `handleUpdateImage` | `PUT /api/update/:id` | 部分更新，`undefined` 字段保持不变 |
| `handleDeleteImage` | `DELETE /api/delete/:id` | 按 id 删除，未命中 404 |
| `handleBatchCreateImages` | `POST /api/batch` | 逐条校验，返回逐条结果 |
| `handleBatchUpdateImageTags` | `POST /api/batch-update` | 单事务批量增删标签 |

## Boundary

**事务边界**：所有写路由把「读全量 → 本地改 → 写回」整段包进
`withGalleryTransaction`。这是模块内私有的模块级 Promise 链，链尾吞异常。
它解决的问题不是「写排队」（那是 `saveAllImages` 的职责），而是**读写之间让出
控制权导致的丢失更新**：并发 create 各自读到同一份旧快照，后写覆盖先写，
图库条目被静默吞掉。

**请求体**：一律经 `readJsonBody`，返回三态（成功 / `too-large` / `invalid`）。
`too-large` 回 413，与「不是合法 JSON」的 400 分开 —— 两个上限（500 条 × 2048 字符
≈ 1MB）与体积上限（256KB）是乘法关系，混为一谈会让用户去逐条检查格式。

**响应形状**：单条接口返回 `ImageRecord`；批量接口返回
`{ total, success, failed, results[] }`，每条 result 至少含 `success` 与 `url`
（失败项的 `url` 允许空串，见 `Invalid image payload` 分支）。

## Invariants

1. **随机取图的 `exclude` 是软偏好**。仅当候选数 > 1 时才排除；过滤后若池子变空
   （存储被手工改出重复 id），回退到未过滤的候选集 —— 宁可返回上一张，
   也不能让这个 tag 变成持续 500。
2. **统计写入绝不阻塞热路径**。`updateRequestStats` 的 promise 在 `waitUntil`
   存在时投递到后台；不存在时最多等 500ms 后放弃。
3. **写失败不是错误路径**：批量接口「一条都没成功」时不写库（`successCount > 0`
   才 `saveAllImages`），省掉一次整库重写。
4. **URL 去重按规范化结果**（`new URL().toString()`），`create` 与 `batch` 同一口径。
5. **标签删除大小写不敏感，存储按原样**。`batch-update` 先删后加，
   加回仍过 `normalizeTags`（trim / 截断 / 去重 / 封顶 20）。
6. **列表过滤全站大小写不敏感**：`search` 匹配标题、URL、标签三者之一；
   `search` 截 100 字、`tag` 截 40 字后才进线性扫描。
7. **分页参数静默夹取**：`pageSize` 夹到 `[1, 60]`、默认 24；`page` 夹到
   `[1, totalPages]`，`totalPages` 至少为 1。

## Notes

`/api/list` 有两条形态：无参返回**裸数组**（遗留形状，供导入去重预检拿全量），
有参返回分页对象。前端 `fetchImagesPage` 与 `fetchExistingImageUrlSet` 都同时
兼容两种形状，见 [[tcapi-mod-api-client]]。
