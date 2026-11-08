import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchHealth, measureRandomLatency } from "@/lib/api";

/**
 * 状态页两个接口里剩下的边界。
 *
 * `fetchHealth` 的 ok / kv 绑定标记是布尔收口：`Boolean("false")` 是 true，
 * 把服务端返回的字符串脏值读成「健康」。状态页是「服务挂了时用户来看」的
 * 页面，把失败显示成正常比白屏更糟。
 *
 * `measureRandomLatency`：redirect 为 manual 时 2xx/3xx 与 opaqueredirect
 * 都算可达；4xx/5xx 必须抛中文错误，否则状态页会把一次失败测速当成 0ms 成功。
 *
 * 字符串字段回退与 500 的失败归类分别由 health-string-fields.test.ts 与
 * status-page.test.tsx 覆盖，这里不重复。
 */

function stubWindow() {
  vi.stubGlobal("window", {
    location: { origin: "https://t.example.test", pathname: "/status", search: "", hash: "" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchHealth · 布尔字段收口", () => {
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

  it("ok 只认真正的 true：字符串 'false' 不能被读成健康", async () => {
    stubOnce({ ok: "false", kv: {} });
    const health = await fetchHealth();
    expect(health.ok).toBe(false);
  });

  it("kv 的两个绑定标记同样只认真正的 true", async () => {
    stubOnce({ ok: true, kv: { imagesBound: "false", statsBound: 0 } });
    const health = await fetchHealth();
    expect(health.kv.imagesBound).toBe(false);
    expect(health.kv.statsBound).toBe(false);
  });

  it("kv 绑定为真时照常透传", async () => {
    stubOnce({ ok: true, kv: { imagesBound: true, statsBound: true } });
    const health = await fetchHealth();
    expect(health.ok).toBe(true);
    expect(health.kv.imagesBound).toBe(true);
    expect(health.kv.statsBound).toBe(true);
  });
});

describe("measureRandomLatency · 不可达判定", () => {
  function stubResponse(response: Response) {
    stubWindow();
    vi.stubGlobal("fetch", vi.fn(async () => response));
  }

  it("302（未 follow）算可达，并返回整数毫秒", async () => {
    stubResponse(new Response(null, { status: 302 }));
    const ms = await measureRandomLatency();
    expect(Number.isInteger(ms)).toBe(true);
    expect(ms).toBeGreaterThanOrEqual(0);
  });

  it("404 / 503 抛中文错误（不能把失败当成 0ms 成功）", async () => {
    for (const status of [404, 503]) {
      stubResponse(new Response(null, { status }));
      await expect(measureRandomLatency(), `status=${status}`).rejects.toThrow(/接口返回异常状态/);
    }
  });
});
