import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHealth } from "@/lib/api";

/**
 * fetchHealth 必须归一化 kv，否则状态页会在**渲染期**崩掉。
 *
 * status-page 的 deriveOverall() 在渲染中直接读：
 *     const bound = health.kv.imagesBound && health.kv.statsBound;
 * 实测响应缺 kv / kv 为 null 时：
 *     -> THROWS Cannot read properties of undefined (reading 'imagesBound')
 * 这是渲染期异常：整页落到错误边界。
 *
 * 而状态页恰恰是「服务可能挂了、用户来确认」的页面 ——
 * 它自己白屏是最糟糕的结果。缺字段应解释为「未绑定」，
 * 页面显示降级/不可用，而不是崩。
 */

/**
 * apiRequest -> withNoCacheQuery 里会读 window.location.origin 来拼绝对地址，
 * 而测试环境没有 DOM。与 api-client-preview.test.ts 一样先补一个最小 window。
 */
function stubWindow() {
  vi.stubGlobal("window", {
    location: {
      origin: "https://example.test",
      pathname: "/status",
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

/** 与 status-page 里 deriveOverall 的取值方式保持一致 */
function deriveBound(health: { kv: { imagesBound: boolean; statsBound: boolean } }) {
  return health.kv.imagesBound && health.kv.statsBound;
}

describe("fetchHealth · kv 归一化", () => {
  it("正常响应原样透传", async () => {
    stubFetchOnce({
      ok: true,
      runtime: "edgeone-pages",
      buildId: "edgeone-js-1",
      timestamp: "2026-01-01T00:00:00.000Z",
      kv: { imagesBound: true, statsBound: true },
    });
    const h = await fetchHealth();
    expect(h.ok).toBe(true);
    expect(h.runtime).toBe("edgeone-pages");
    expect(deriveBound(h)).toBe(true);
  });

  it("缺 kv 时不抛异常，按未绑定处理", async () => {
    stubFetchOnce({ ok: true, runtime: "edgeone-pages", buildId: "x" });
    const h = await fetchHealth();
    expect(h.kv.imagesBound).toBe(false);
    expect(h.kv.statsBound).toBe(false);
    expect(deriveBound(h)).toBe(false);
  });

  it("kv 为 null 时同样不抛", async () => {
    stubFetchOnce({ ok: true, kv: null });
    const h = await fetchHealth();
    expect(h.kv.imagesBound).toBe(false);
    expect(deriveBound(h)).toBe(false);
  });

  it("空响应体也能安全消费", async () => {
    stubFetchOnce({});
    const h = await fetchHealth();
    expect(typeof h.timestamp).toBe("string");
    expect(h.timestamp.length).toBeGreaterThan(0);
    expect(deriveBound(h)).toBe(false);
  });
});
