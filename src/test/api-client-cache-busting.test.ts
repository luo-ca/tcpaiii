import { afterEach, describe, expect, it, vi } from "vitest";

import { withNoCacheQuery } from "@/lib/api-client";

/**
 * `withNoCacheQuery` 的三种输入形态。
 *
 * 它只对 GET 生效（写请求从不被缓存，加 `_t` 只会污染地址），并且必须同时
 * 保住 EdgeOne 预览参数。三种输入（字符串 / URL / Request）各有各的坑：
 *   · 字符串分支返回的是**相对路径**（同源请求，不能被拼成绝对地址）；
 *   · URL 分支必须复制一份，不能原地改调用方的对象；
 *   · Request 分支重建对象时 body 与 headers 要带过去，否则写请求会丢 body。
 *
 * 这些分支此前只有端到端用例间接穿过，且从没断言过「不改调用方入参」。
 */

function stubWindow(search = "") {
  vi.stubGlobal("window", {
    location: { origin: "https://t.example.test", pathname: "/gallery", search, hash: "" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("withNoCacheQuery · GET", () => {
  it("字符串输入返回相对路径，并带上 `_t`", () => {
    stubWindow();
    const out = withNoCacheQuery("/api/random?tag=acg");
    expect(typeof out).toBe("string");
    const url = new URL(String(out), "https://t.example.test");
    expect(url.pathname).toBe("/api/random");
    expect(url.searchParams.get("tag")).toBe("acg");
    expect(url.searchParams.get("_t")).toMatch(/^\d+$/);
  });

  it("字符串输入保留预览参数", () => {
    stubWindow("?eo_token=abc&eo_time=123");
    const url = new URL(String(withNoCacheQuery("/api/random")), "https://t.example.test");
    expect(url.searchParams.get("eo_token")).toBe("abc");
    expect(url.searchParams.get("eo_time")).toBe("123");
    expect(url.searchParams.has("_t")).toBe(true);
  });

  it("URL 输入返回新对象，不修改调用方传入的那个", () => {
    stubWindow();
    const original = new URL("https://t.example.test/api/list?page=2");
    const before = original.toString();
    const out = withNoCacheQuery(original);
    expect(out).not.toBe(original);
    expect(original.toString(), "调用方的 URL 被原地改了").toBe(before);
    expect((out as URL).searchParams.get("_t")).toBeTruthy();
    expect((out as URL).searchParams.get("page")).toBe("2");
  });

  it("Request 输入保留 method 与 headers，并只改地址", () => {
    stubWindow();
    const request = new Request("https://t.example.test/api/list?page=1", {
      method: "GET",
      headers: { "x-probe": "1" },
    });
    const out = withNoCacheQuery(request);
    expect(out).toBeInstanceOf(Request);
    const rebuilt = out as Request;
    expect(rebuilt.method).toBe("GET");
    expect(rebuilt.headers.get("x-probe")).toBe("1");
    const url = new URL(rebuilt.url);
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("_t")).toBeTruthy();
  });
});

describe("withNoCacheQuery · 非 GET", () => {
  it("init.method 为写方法时原样返回（不加 `_t`）", () => {
    stubWindow();
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      expect(withNoCacheQuery("/api/create", { method })).toBe("/api/create");
    }
  });

  it("方法大小写不敏感（小写 post 同样跳过）", () => {
    stubWindow();
    expect(withNoCacheQuery("/api/create", { method: "post" })).toBe("/api/create");
  });

  it("Request 输入时按 Request 自身的 method 判断", () => {
    stubWindow();
    const request = new Request("https://t.example.test/api/create", {
      method: "POST",
      body: "{}",
    });
    expect(withNoCacheQuery(request)).toBe(request);
  });

  it("没有 method 时按 GET 处理（默认补 `_t`）", () => {
    stubWindow();
    const out = withNoCacheQuery("/api/stats");
    expect(new URL(String(out), "https://t.example.test").searchParams.has("_t")).toBe(true);
  });

  it("同一时刻的 `_t` 相同，不同时刻不同（破缓要真的破掉）", () => {
    stubWindow();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const first = new URL(String(withNoCacheQuery("/api/random")), "https://t.example.test");
    const sameMoment = new URL(String(withNoCacheQuery("/api/random")), "https://t.example.test");
    vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
    const second = new URL(String(withNoCacheQuery("/api/random")), "https://t.example.test");
    expect(sameMoment.searchParams.get("_t")).toBe(first.searchParams.get("_t"));
    expect(second.searchParams.get("_t")).not.toBe(first.searchParams.get("_t"));
  });
});
