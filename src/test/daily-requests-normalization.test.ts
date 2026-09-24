import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStats } from "@/lib/api";

/**
 * dailyRequests 的每个值都必须收成数字（P118）。
 *
 * fetchStats 原先只写 `const daily = (body?.dailyRequests ?? {}) as Record<string, number>`
 * —— `?? {}` 只挡 null/undefined，**挡不住「值是字符串」**。而 RealtimeStats 里是
 * `chartData.reduce((sum, item) => sum + item.requests, 0)`：
 * 一旦有字符串混进来，`+` 会退化成字符串拼接。
 *
 * 用桩实测（把其中两天写成 "12" / "130"）：
 *   「近 7 天」显示成 **1,201,307,685,123 次**（正确值 300）
 * 一个明显荒谬的天文数字直接摆在首页，比不显示更糟。
 *
 * 修法：在边界逐个校验 —— 只接受有限数字，其余丢弃（缺的天按 0 处理）。
 */

function stubOnce(body: unknown) {
  vi.stubGlobal("window", {
    location: { origin: "https://t.example.test", pathname: "/", search: "", hash: "" },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dailyRequests 归一化 · 字符串值不会污染求和", () => {
  it("字符串值被丢弃，数字值保留", async () => {
    stubOnce({
      dailyRequests: { "2026-09-17": "12", "2026-09-18": 0, "2026-09-19": "130", "2026-09-20": 76 },
      totalRequests: 1, todayRequests: 1, totalImages: 1, tags: [],
    });
    const stats = await fetchStats();
    expect(stats.dailyRequests?.["2026-09-18"]).toBe(0);
    expect(stats.dailyRequests?.["2026-09-20"]).toBe(76);
    expect(stats.dailyRequests?.["2026-09-17"], "字符串值被保留 → 求和会变成字符串拼接").toBeUndefined();
    // 求和结果必须是数字（这正是页面上那行「近 7 天 N 次」）
    const sum = Object.values(stats.dailyRequests ?? {}).reduce((a, b) => a + b, 0);
    expect(typeof sum, "求和退化为字符串拼接").toBe("number");
    expect(sum).toBe(76);
  });

  it("dailyRequests 不是对象时退化为空（不抛错）", async () => {
    stubOnce({ dailyRequests: "oops", totalRequests: 1, todayRequests: 1, totalImages: 1, tags: [] });
    const stats = await fetchStats();
    expect(stats.dailyRequests).toEqual({});
  });

  it("数组形状同样被拒（避免 Object.entries 拿到下标当日期）", async () => {
    stubOnce({ dailyRequests: [1, 2, 3], totalRequests: 1, todayRequests: 1, totalImages: 1, tags: [] });
    const stats = await fetchStats();
    expect(stats.dailyRequests).toEqual({});
  });

  it("NaN / Infinity 都不算有效计数", async () => {
    stubOnce({
      dailyRequests: { a: Number.NaN, b: Number.POSITIVE_INFINITY, c: 5 },
      totalRequests: 1, todayRequests: 1, totalImages: 1, tags: [],
    });
    const stats = await fetchStats();
    expect(stats.dailyRequests).toEqual({ c: 5 });
  });
});
