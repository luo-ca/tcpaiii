---
id: tcapi-mod-stats-auth
type: module-design
status: active
title: 统计与管理鉴权
parent: tcapi-architecture
tags: [backend, stats, auth]
---

# 统计与管理鉴权

两个同族但职责独立的模块：`lib/stats.ts`（调用统计的采集与聚合）与
`lib/auth.ts`（管理密钥校验与失败限流）。合在一份 SPEC 是因为它们的
共同约束是同一个：**都要在热路径上不添乱**。

## Responsibility

### 统计（`lib/stats.ts`）

| 导出 | 用途 |
| --- | --- |
| `updateRequestStats` | 每次 `/api/random` 调用后累加 |
| `handleStats` | `GET /api/stats` 的响应组装 |
| `getStatsDateKey` | 按 `Asia/Shanghai` 把时刻分到 `YYYY-MM-DD` 桶 |
| `getRecentStatsDateKeys` | 生成最近 N 天的键（默认 7） |
| `resetStatsCache` | 清统计内存缓存（测试用） |

存储形状（`stats_kv:data`）：
`{ totalRequests, lastRequestAt, dailyRequests: Record<date,count>, sites: Record<host,count> }`。

`/api/stats` 的响应是它的**投影**：`dailyRequests` 只回最近 7 天（缺的日期补 0），
`todayRequests` 取今日桶，`totalImages` 与 `tags` 来自图库的 `meta`，
`totalSites` 取 `sites` 的键数。

### 鉴权（`lib/auth.ts`）

| 导出 | 用途 |
| --- | --- |
| `verifyAdminRequest` | 写路由的统一前置：限流检查 + 校验，返回 `Response \| null` |
| `handleAdminVerify` | `GET /api/admin/verify` |
| `getBearerToken` | 从 `Authorization` 取 Bearer 值 |
| `timingSafeEqualString` | 定长比较（异或累加） |
| `sha256Hex` | WebCrypto 摘要转小写 hex |
| `resetAdminThrottle` | 清失败表（测试用） |

密钥解析优先级：`ADMIN_TOKEN`（明文，定长比较）→ `ADMIN_TOKEN_SHA256`（比对摘要）
→ KV `admin_config.tokenSha256`（比对摘要）。三者皆空返回 `503`。

## Boundary

**统计写入的投递**：`updateRequestStats` 返回 promise，由 `handleRandomImage`
决定等不等（见 [[tcapi-mod-gallery-api]]）。统计模块自己不做 `waitUntil` ——
它不知道运行时的能力。

**统计读写的串行化**：`_statsQueue` 把「读快照 → 自增 → 写回」整段串起来。
只给写排队不够：读写之间让出控制权，并发请求各自 +1 后互相覆盖，
「累计/今日调用」静默少计。

**限流的键**：`x-forwarded-for` 第一跳 → `x-real-ip` → 字面量 `local`。
失败窗口 60 秒、阈值 20 次；成功一次即清除该键的失败记录。
`503`（服务端未配置密钥）**不计入失败** —— 那不是调用方的错。

**失败表的容量**：超过 5000 条时先清已过窗口的，仍超则整体清空。
这是防止单个攻击者把内存撑爆的兜底，不是精确 LRU。

## Invariants

1. **时区分桶只用 `STATS_TIME_ZONE`**。前端渲染「今日调用」的日期时也用同一常量，
   否则 UTC 以西的访客会看到「今日调用 61 · 昨天日期」。
2. **`dailyRequests` 只保留最近 90 天**（`MAX_TRACKED_DAILY_KEYS`），
   `sites` 只保留 Top 500（`MAX_TRACKED_SITES`）。两者都是「只增」的桶，
   而热路径每次都要全量 `JSON.stringify` 重写，不封顶就是线性膨胀。
   裁剪发生在**读回归一化**处，因此存量脏数据首次读取即自愈。
   进入桶的键必须是**真实存在的日期**（`isStatsDateKey` 做 UTC 往返比对，
   拒绝 `2026-13-45` / `2026-02-30`）：只查形状会让这类脏键白占保留名额，
   把真实日期挤出去。
3. **`sites` 只认带 `Origin` / `Referer` 的浏览器请求**，取 hostname(:port) 去重。
   服务端/代理调用方不计入 —— 所以文案是「来源站点 · 带来源头的浏览器请求」，
   不能说成「接入网站总数」。
4. **定长比较**：`timingSafeEqualString` 对不等长输入也走满 `maxLength` 次循环，
   长度差并入初值，不提前 return。
5. **校验失败才计数**：`401`/`403` 记录，`429` 与 `503` 不记录。

## Notes

`/api/health` 刻意**不**写统计，也不读 KV 数据（只探测绑定），因此状态页的
30 秒轮询不会让「累计调用」虚增，见 [[tcapi-mod-status-page]]。
