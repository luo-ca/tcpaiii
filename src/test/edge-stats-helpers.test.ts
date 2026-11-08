import { describe, expect, it } from "vitest";

import {
  cloneStatsRecord,
  getRecentStatsDateKeys,
  getStatsDateKey,
  isStatsDateKey,
  normalizeStatCount,
} from "../../edge-functions-src/lib/stats";
import { STATS_TIME_ZONE } from "../../edge-functions-src/lib/types";

/**
 * 统计层的日期键与计数归一化。
 *
 * 这些是 /api/stats 与 /api/random 热路径共用的纯函数：
 *   · getStatsDateKey —— 今日桶的键，决定「今日调用」归到哪一天；
 *   · getRecentStatsDateKeys —— 公开响应那 7 个桶的顺序与内容；
 *   · isStatsDateKey —— 读回归一化时哪些键算合法；
 *   · normalizeStatCount —— 存量脏计数收成非负整数。
 *
 * functions-api.test.ts 已直接钉住 getStatsDateKey / getRecentStatsDateKeys 的
 * 单点取值，这里不重复，只补它们未覆盖的边界（跨月回退、默认 7 天、形态约束）。
 * 注意时区口径固定为 STATS_TIME_ZONE（Asia/Shanghai，UTC+8）。
 */

describe("getStatsDateKey", () => {
  it("跨 UTC 日界时按上海时区分桶，而不是 UTC", () => {
    // 2026-04-28T20:00Z 的 UTC 日期是 04-28，上海已是 04-29
    expect(getStatsDateKey(new Date("2026-04-28T20:00:00.000Z"))).toBe("2026-04-29");
    // 2026-04-28T15:59:59Z == 上海 2026-04-28 23:59，仍是同一天
    expect(getStatsDateKey(new Date("2026-04-28T15:59:59.000Z"))).toBe("2026-04-28");
  });

  it("输出恒为 YYYY-MM-DD（可被 isStatsDateKey 接受）", () => {
    for (const iso of [
      "2026-01-01T00:00:00.000Z",
      "2026-06-15T12:00:00.000Z",
      "2026-12-31T23:59:59.000Z",
    ]) {
      const key = getStatsDateKey(new Date(iso));
      expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(isStatsDateKey(key)).toBe(true);
    }
  });

  it("时区常量仍是 Asia/Shanghai（与前端展示口径同源）", () => {
    expect(STATS_TIME_ZONE).toBe("Asia/Shanghai");
  });
});

describe("getRecentStatsDateKeys", () => {
  it("默认 7 天，且全部是合法日期键", () => {
    const keys = getRecentStatsDateKeys();
    expect(keys).toHaveLength(7);
    for (const key of keys) expect(isStatsDateKey(key)).toBe(true);
    expect(new Set(keys).size).toBe(7);
  });

  it("跨月边界按日历回退（不产生 2026-02-30）", () => {
    expect(getRecentStatsDateKeys(3, new Date("2026-03-01T00:30:00.000Z"))).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
    ]);
  });
});

describe("isStatsDateKey", () => {
  it("接受 YYYY-MM-DD 形态", () => {
    expect(isStatsDateKey("2026-01-01")).toBe(true);
    expect(isStatsDateKey("2026-12-31")).toBe(true);
  });

  it("拒绝非两位数字的月份/日", () => {
    expect(isStatsDateKey("2026-1-1")).toBe(false);
    expect(isStatsDateKey("2026-01-1")).toBe(false);
    expect(isStatsDateKey("abc")).toBe(false);
    expect(isStatsDateKey("")).toBe(false);
  });

  it("拒绝形状对但月份/日不可能的键（否则脏键会挤占保留名额）", () => {
    // 只查形状时 '2026-13-45' 会被当成合法桶收进 dailyRequests，
    // 白占 MAX_TRACKED_DAILY_KEYS 的名额，把真实日期挤出去。
    expect(isStatsDateKey("2026-13-01")).toBe(false);
    expect(isStatsDateKey("2026-00-10")).toBe(false);
    expect(isStatsDateKey("2026-01-00")).toBe(false);
    expect(isStatsDateKey("2026-01-32")).toBe(false);
    expect(isStatsDateKey("2026-02-30"), "2 月 30 日不存在").toBe(false);
  });
});

describe("normalizeStatCount", () => {
  it("非负整数原样返回", () => {
    expect(normalizeStatCount(0)).toBe(0);
    expect(normalizeStatCount(42)).toBe(42);
  });

  it("小数向下取整，负数夹到 0", () => {
    expect(normalizeStatCount(3.7)).toBe(3);
    expect(normalizeStatCount(-1)).toBe(0);
    expect(normalizeStatCount(-0.5)).toBe(0);
  });

  it("非数字 / 非有限数一律归 0（不把 NaN 写进计数）", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, "5", null, undefined, {}]) {
      expect(normalizeStatCount(value)).toBe(0);
    }
  });
});

describe("cloneStatsRecord", () => {
  const base = {
    totalRequests: 7,
    lastRequestAt: "2026-04-29T00:00:00.000Z",
    dailyRequests: { "2026-04-29": 3 },
    sites: { "example.test": 2 },
  };

  it("浅层字段与嵌套表都复制出来", () => {
    expect(cloneStatsRecord(base)).toEqual(base);
  });

  it("修改克隆不影响原对象（缓存快照必须隔离）", () => {
    const clone = cloneStatsRecord(base);
    clone.dailyRequests["2026-04-29"] = 99;
    clone.sites["example.test"] = 99;
    expect(base.dailyRequests["2026-04-29"]).toBe(3);
    expect(base.sites["example.test"]).toBe(2);
  });
});
