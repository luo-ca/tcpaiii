---
id: tcapi-mod-kv-store
type: module-design
status: active
title: KV 存储层
parent: tcapi-architecture
tags: [backend, kv, storage]
---

# KV 存储层

`edge-functions-src/lib/kv.ts`。所有 KV 读写的唯一出口。

## Responsibility

1. **解析 KV 绑定**。优先读运行时注入的具名绑定，兼容 `EdgeKV` 构造器回退。
2. **维护图库内存缓存与派生索引**（`byTag` / `sortedTags` / `urlSet`）。
3. **串行化写入**并维护 `all` 与派生 `meta` 的一致性。
4. 提供管理配置（`admin_config`）读取与运行时密钥读取。

## Boundary

导出面：

| 导出 | 用途 |
| --- | --- |
| `getKvImages` / `getKvStats` | 取命名空间句柄 |
| `getKvHealth` | 只探测绑定存在性，供 `/api/health` |
| `getImagesState` | 读 `all` 并返回 `{ images, index }`，带 10s 内存缓存 |
| `getAllImages` | 上者的便捷包装 |
| `getImagesMeta` | 读 `meta`；缺失/损坏时回退现场重建 |
| `saveAllImages` | 串行写 `all` + `meta` |
| `buildImageIndex` | 纯函数：由图片数组建 `byTag` / `sortedTags` / `urlSet` |
| `getAdminConfig` | 读 `stats_kv:admin_config`，校验 `tokenSha256` 是 64 位 hex |
| `getRuntimeSecret` | 按 `runtimeEnv` → `globalThis` → `__ENV` → `process.env` 逐级找密钥 |
| `parseStoredJson` | 宽容 JSON 解析，坏数据回退 |
| `resetImagesCache` | 清内存缓存（测试用） |

绑定名候选顺序固定为 `images_kv` → `IMAGES_KV` → `images`（统计侧同理）。
三者都拿不到时回退 `new EdgeKV({namespace})`；`EdgeKV` 也不存在则抛错，
错误文案直接指出该绑定哪个变量名。

## Invariants

1. **`all` 是唯一权威**。`meta` 只是它的派生缓存，任何时刻都可以被删除并由
   `getImagesMeta` 从 `all` 重建。这条是 `saveAllImages` 失败处理的前提：
   若 `all` 写成功而 `meta` 写失败，代码**删除** `meta` 而不是回滚 `all`。
2. **写入必须排队**。`_saveQueue` 把「put all → put meta → 更新缓存」串成一条链；
   链尾吞掉异常（`task.catch(() => undefined)`）以免一次失败卡死后续所有写，
   但异常照常回传给本次调用方。
3. **写入取快照**：`images.slice()` 在入队**前**执行，避免调用方在队列等待期间
   改动数组导致写进去的内容和调用方以为的不一致。
4. **标签去重大小写不敏感**，保留首次出现的原样写法。建索引与读回存量 meta
   共用 `dedupeTagsCaseInsensitive`，否则 `/api/stats` 的标签会多出「看起来不同、
   点下去同一批」的 chip。
5. **缓存 TTL 10 秒**（`KV_CACHE_TTL_MS`），图库与统计同一档。
6. **读入的脏数据一律清洗而非信任**：`sanitizeStoredImage` 丢弃无有效 URL 或
   非法 tags 的记录，缺 `id` 时按 `img-<createdAt>-<url>` 合成，缺 `createdAt`
   时落到 `1970-01-01T00:00:00.000Z`。

## Notes

缓存是**进程级**的：多实例之间各自持有 10 秒窗口，写后只有处理该写的实例会
立即更新缓存，其它实例最多滞后一个 TTL。这是 KV 无事务模型下的已知取舍，
不额外做失效广播。
