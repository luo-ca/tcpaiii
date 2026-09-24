import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHealth, fetchStats } from "@/lib/api";
import type { HealthPayload, Stats } from "@/lib/types";

/**
 * 时间戳字段必须是「可渲染的」才交给界面（P117）。
 *
 * 后端契约上 lastRequestAt / timestamp 是 ISO 串，前端也只做了
 * `typeof === 'string'` 的判断。但一旦拿到解析不了的串（脏数据、
 * 上游透传、字段改名），会发生什么：
 *
 *   const d = new Date('不是日期');        // Invalid Date
 *   d.toLocaleDateString('zh-CN', {...})   // → 字面量 "Invalid Date"
 *
 * 也就是说中文页面上会直接露出英文脏值。用桩实测确认过：把
 * /api/stats 的 lastRequestAt 换成非法串，首页「今日调用」下面那格
 * 就显示 Invalid Date；/api/health 的 timestamp 同理影响状态页。
 *
 * 修法：在 api 边界做「可解析才放过」的归一化，解析不了就回退到
 * 各个字段自己的合理默认（null / 当前时间）。
 */

// fetchHealth / fetchStats 走 buildApiPath，需要最小 window stub
function stubWindow() {
  vi.stubGlobal("window", {
    location: { origin: "https://t.example.test", pathname: "/", search: "", hash: "" },
  });
}

function stubOnce(body: unknown) {
  stubWindow();
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

describe("时间戳归一化 · 非法值不会渲染成 Invalid Date", () => {
  it("fetchStats：非法 lastRequestAt 归一为 null（调用方会走「暂无数据」）", async () => {
    stubOnce({ lastRequestAt: "不是日期", totalRequests: 1, todayRequests: 1, totalImages: 1, tags: [] });
    const stats: Stats = await fetchStats();
    expect(stats.lastRequestAt, "非法日期被原样放过 → 页面会显示 Invalid Date").toBeNull();
  });

  it("fetchStats：合法 ISO 原样保留", async () => {
    const iso = "2026-09-23T10:00:00.000Z";
    stubOnce({ lastRequestAt: iso, totalRequests: 1, todayRequests: 1, totalImages: 1, tags: [] });
    const stats = await fetchStats();
    expect(stats.lastRequestAt).toBe(iso);
  });

  it("fetchHealth：非法 timestamp 回退到当前时间（保证可渲染）", async () => {
    stubOnce({ ok: true, runtime: "edge", buildId: "x", timestamp: "不是日期", kv: {} });
    const health: HealthPayload = await fetchHealth();
    expect(Number.isNaN(Date.parse(health.timestamp)), "时间戳不可解析 → 状态页会显示 Invalid Date").toBe(false);
  });

  it("fetchHealth：合法 ISO 原样保留", async () => {
    const iso = "2026-09-23T10:00:00.000Z";
    stubOnce({ ok: true, runtime: "edge", buildId: "x", timestamp: iso, kv: {} });
    const health = await fetchHealth();
    expect(health.timestamp).toBe(iso);
  });
});
