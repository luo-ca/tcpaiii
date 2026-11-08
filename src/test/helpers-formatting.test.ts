import { describe, expect, it } from "vitest";
import { formatNumber, formatShortDate } from "@/lib/helpers";

/**
 * 展示层的两个格式化函数。
 *
 * formatShortDate 喂的是 /api/stats 的 dailyRequests 键（`YYYY-MM-DD`），
 * formatNumber 喂的是四个计数字段。两者都在渲染路径上，出错不会抛异常 ——
 * 只会在页面上留下「9/NaN」「NaN 次」这类字面量。
 *
 * 原先的实现是 `value.split('-')` 后直接 Number(month)/Number(day)：
 * 拿到 ISO 时间戳时 day 变成 "17T00:00:00.000Z"，Number() 得 NaN。
 * 这里的用例把「认不出形态就原样返回、绝不产出 NaN」钉住。
 */

describe("formatShortDate", () => {
  it("标准日期键转成 月/日，且不保留前导零", () => {
    expect(formatShortDate("2025-06-15")).toBe("6/15");
    expect(formatShortDate("2026-01-05")).toBe("1/5");
    expect(formatShortDate("2026-12-31")).toBe("12/31");
  });

  it("容忍单位数月/日（手工构造或旧数据）", () => {
    expect(formatShortDate("2026-9-1")).toBe("9/1");
  });

  it("ISO 时间戳只取日期部分，不得产出 NaN", () => {
    expect(formatShortDate("2026-09-17T00:00:00.000Z")).toBe("9/17");
    expect(formatShortDate("2026-09-17 00:00:00")).toBe("9/17");
  });

  it("认不出的形态原样返回（绝不渲染 NaN）", () => {
    for (const value of ["", "abc", "2026", "2026-", "2026-09", "9/17", "2026/09/17"]) {
      const out = formatShortDate(value);
      expect(out, `"${value}" 被格式化成了 ${out}`).toBe(value);
      expect(out).not.toContain("NaN");
    }
  });
});

describe("formatNumber", () => {
  it("按 zh-CN 加千位分隔", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(999)).toBe("999");
    expect(formatNumber(1000)).toBe("1,000");
    expect(formatNumber(1234567)).toBe("1,234,567");
  });

  it("负数与小数不被吞掉", () => {
    expect(formatNumber(-1234)).toBe("-1,234");
    expect(formatNumber(1.5)).toBe("1.5");
  });
});
