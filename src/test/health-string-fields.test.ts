import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHealth } from "@/lib/api";

/**
 * /api/health 的字符串字段必须收成字符串，否则状态页会自己崩掉（P119）。
 *
 * fetchHealth 原先写 `runtime: body?.runtime ?? 'unknown'` —— `??` 只挡
 * null/undefined，**挡不住对象**。而状态页把 runtime 直接放进 JSX 渲染，
 * React 对 object 会抛 "Objects are not valid as a React child"。
 *
 * 用桩实测（runtime 返回 {name:"edge",ver:1}、buildId 返回 {hash:"abc"}）：
 *   修复前：整页落到错误边界，显示「页面出错了 / 这一块没能正常显示」
 *   修复后：正常渲染，runtime 显示兜底值 unknown
 *
 * 状态页的定位恰恰是「服务挂了时用户来看」，它自己崩掉是最糟的结果 ——
 * 与 fetchHealth 里已有的 kv 防御同源（那里也注释了这个理由）。
 */

function stubOnce(body: unknown) {
  vi.stubGlobal("window", {
    location: { origin: "https://t.example.test", pathname: "/status", search: "", hash: "" },
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

describe("fetchHealth · 非字符串字段不会让状态页崩", () => {
  it("runtime 是对象时回退到 unknown", async () => {
    stubOnce({ ok: true, runtime: { name: "edge", ver: 1 }, buildId: "x", timestamp: "2026-09-23T00:00:00Z", kv: {} });
    const h = await fetchHealth();
    expect(typeof h.runtime, "runtime 不是字符串 → React 渲染时会抛错、整页崩").toBe("string");
    expect(h.runtime).toBe("unknown");
  });

  it("buildId 是对象时回退到空串", async () => {
    stubOnce({ ok: true, runtime: "edge", buildId: { hash: "abc" }, timestamp: "2026-09-23T00:00:00Z", kv: {} });
    const h = await fetchHealth();
    expect(typeof h.buildId, "buildId 不是字符串 → 卡片渲染会崩").toBe("string");
    expect(h.buildId).toBe("");
  });

  it("数组同样被拒（数组也是合法 React child，但会渲染出乱码）", async () => {
    stubOnce({ ok: true, runtime: ["edge"], buildId: ["x"], timestamp: "2026-09-23T00:00:00Z", kv: {} });
    const h = await fetchHealth();
    expect(h.runtime).toBe("unknown");
    expect(h.buildId).toBe("");
  });

  it("正常字符串原样保留", async () => {
    stubOnce({ ok: true, runtime: "edgeone-edge", buildId: "abcdef", timestamp: "2026-09-23T00:00:00Z", kv: {} });
    const h = await fetchHealth();
    expect(h.runtime).toBe("edgeone-edge");
    expect(h.buildId).toBe("abcdef");
  });
});
