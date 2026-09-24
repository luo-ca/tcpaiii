import { afterEach, describe, expect, it, vi } from "vitest";
import { measureRandomLatency } from "@/lib/api";

/**
 * measureRandomLatency 必须自带超时（P140）。
 *
 * 这条路径刻意用裸 fetch 而不是 apiRequest：redirect:'manual' + cache:'no-store'
 * 是它独有的语义（图床无 CORS、CSP connect-src 'self'），不能走公共封装。
 * 代价是它没继承 P138 给 apiRequest 加的 15s 兜底 ——
 *
 *   const response = await fetch(buildApiPath('/api/random'), {...});
 *
 * 边缘函数挂住（TCP 连着但永不返回）时这个 await 永远悬着，状态页的
 * `latencyBusy` 就一直停在 true：按钮永久禁用、界面永远显示「测速中…」，
 * 用户既看不到错也点不动。这正是 P138 在别处修掉的那个问题，只是漏了这条。
 *
 * 修法：同样用 AbortSignal.timeout，门限常量与 api-client 同源。
 * 超时值可注入（默认 15s），测试注短值 —— 否则验证超时路径要让整个
 * 测试套件干等 15 秒。
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubWindow() {
  vi.stubGlobal("window", {
    location: { origin: "https://t.example.test", pathname: "/status", search: "", hash: "" },
  });
}

describe("measureRandomLatency · 超时兜底（P140）", () => {
  it("请求带上 signal（否则挂起的接口会让状态页永远转圈）", async () => {
    stubWindow();
    const calls: RequestInit[] = [];
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init ?? {});
      return new Response(null, { status: 200 });
    });

    await measureRandomLatency();
    expect(calls).toHaveLength(1);
    expect(calls[0].signal, "缺 signal → 没有超时，接口挂住就永远悬着").toBeDefined();
    // 未触发时不该是已中断态（否则正常请求会被立刻判失败）
    expect(calls[0].signal!.aborted).toBe(false);
  });

  it("挂起的请求会被超时中断（注入短门限，毫秒级验证）", async () => {
    stubWindow();
    // 模拟「TCP 连着但永不返回」：只有 signal abort 时才 reject
    vi.stubGlobal("fetch", (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return; // 没有 signal 就永远悬着 —— 上一条会先捕捉到
        signal.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
        });
      }),
    );

    const started = Date.now();
    await expect(measureRandomLatency(30)).rejects.toThrow(/abort|timeout/i);
    // 必须真的等满了门限才中断（不是被别的路径立刻打断）
    expect(Date.now() - started).toBeGreaterThanOrEqual(20);
  }, 5000);

  it("正常快速返回时不影响结果（回归闸）", async () => {
    stubWindow();
    vi.stubGlobal("fetch", async () => new Response(null, { status: 302 }));
    const ms = await measureRandomLatency();
    expect(Number.isInteger(ms)).toBe(true);
    expect(ms).toBeGreaterThanOrEqual(0);
  });

  it("默认门限与 apiRequest 同源（15s）", async () => {
    stubWindow();
    let captured: AbortSignal | undefined;
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      captured = init?.signal ?? undefined;
      return new Response(null, { status: 200 });
    });

    await measureRandomLatency();
    // 无法直接读 AbortSignal.timeout 的门限，改为钉住「不传参时不是毫秒级超时」：
    // 略等一会儿后仍未中断，说明默认值远大于测试用的短门限。
    await new Promise((r) => setTimeout(r, 60));
    expect(captured!.aborted).toBe(false);
  });
});