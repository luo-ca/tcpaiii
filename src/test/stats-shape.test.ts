import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStats } from "@/lib/api";

/**
 * fetchStats 必须归一化 tags 与计数字段。
 *
 * /api/stats 有 5 个消费者（Hero / OnlinePreview / RealtimeStats /
 * gallery-browse / admin），都直接读 tags。而两种常见写法都挡不住类型不对：
 *   stats?.tags?.map(...)   -> tags 是字符串时抛
 *                              'stats?.tags?.map is not a function'
 *                              （?. 只挡 null/undefined，不挡类型）
 *   stats?.tags ?? []       -> 字符串被原样放行，长度变成字符数，
 *                              真正 .map 时才炸，而且报错点离病根很远
 *
 * 实测：
 *   {tags:"acg"}  -> .map 路径 THROWS
 *   {tags:{a:1}}  -> .map 路径 THROWS
 *
 * 后端有 sanitizeImagesMeta 兜底，但前端与该接口的契约一直没有校验。
 * 在 API 边界收口，5 个消费者不必各自防御。
 */

function stubWindow() {
  vi.stubGlobal("window", {
    location: {
      origin: "https://example.test",
      pathname: "/",
      search: "",
      hash: "",
    },
  });
}

function stubFetchOnce(body: unknown, status = 200) {
  stubWindow();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchStats · 归一化", () => {
  it("正常响应原样透传", async () => {
    stubFetchOnce({
      totalRequests: 10,
      todayRequests: 2,
      totalImages: 5,
      totalSites: 3,
      tags: ["acg", "二次元"],
      dailyRequests: { "2026-01-01": 4 },
      lastRequestAt: "2026-01-01T00:00:00.000Z",
    });
    const s = await fetchStats();
    expect(s.totalRequests).toBe(10);
    expect(s.tags).toEqual(["acg", "二次元"]);
    expect(s.tags.map((t) => t)).toHaveLength(2);
  });

  it("tags 是字符串时收成空数组，.map 不再抛", async () => {
    stubFetchOnce({ tags: "acg", totalRequests: 1 });
    const s = await fetchStats();
    expect(Array.isArray(s.tags)).toBe(true);
    expect(s.tags).toEqual([]);
    expect(() => s.tags.map((t) => t)).not.toThrow();
  });

  it("tags 是对象时同样收成空数组", async () => {
    stubFetchOnce({ tags: { a: 1 } });
    const s = await fetchStats();
    expect(s.tags).toEqual([]);
  });

  it("计数字段类型不对时回落到 0", async () => {
    stubFetchOnce({ totalRequests: "10", todayRequests: null, totalImages: undefined });
    const s = await fetchStats();
    expect(s.totalRequests).toBe(0);
    expect(s.todayRequests).toBe(0);
    expect(s.totalImages).toBe(0);
  });

  it("dailyRequests 为 null 时回落成空对象", async () => {
    stubFetchOnce({ dailyRequests: null, tags: [] });
    const s = await fetchStats();
    expect(s.dailyRequests).toEqual({});
  });
});
