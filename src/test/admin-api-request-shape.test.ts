import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createImage,
  deleteImage,
  fetchImagesPage,
  updateImage,
  verifyAdminToken,
} from "@/lib/api";

/**
 * 后台写接口的请求形状（方法 / 路径 / 头 / body）。
 *
 * 这些包装函数此前只有返回值一侧被验证过（形状守卫），请求本身从没被断言：
 * 方法写错会 405、Authorization 头漏了会 401、body 漏字段会让服务端把
 * 「没改的字段」当 undefined 处理。服务端错误文案虽然会中文化，但用户看到的
 * 永远是「操作失败」，排查要翻代码。
 */

type Captured = { url: string; init: RequestInit | undefined };

function stubFetchCapture(body: unknown = {}, status = 200): Captured[] {
  const calls: Captured[] = [];
  vi.stubGlobal("window", {
    location: { origin: "https://t.example.test", pathname: "/admin", search: "", hash: "" },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
  return (init?.headers ?? {}) as Record<string, string>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifyAdminToken", () => {
  it("GET 到 /api/admin/verify，带 Bearer 头", async () => {
    const calls = stubFetchCapture({ ok: true });
    await verifyAdminToken("tok-123");
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url, "https://t.example.test");
    expect(url.pathname).toBe("/api/admin/verify");
    expect(calls[0].init?.method ?? "GET").toBe("GET");
    expect(headersOf(calls[0].init).Authorization).toBe("Bearer tok-123");
  });
});

describe("createImage", () => {
  it("POST 到 /api/create，带 JSON 头与 Bearer 头", async () => {
    const calls = stubFetchCapture({ id: "img-1" }, 201);
    await createImage({ url: "https://a.test/x.jpg", title: "标题", tags: ["acg"] }, "tok");

    const url = new URL(calls[0].url, "https://t.example.test");
    expect(url.pathname).toBe("/api/create");
    expect(calls[0].init?.method).toBe("POST");
    const headers = headersOf(calls[0].init);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      url: "https://a.test/x.jpg",
      title: "标题",
      tags: ["acg"],
    });
  });

  it("写请求不加破缓参数（`_t` 只属于 GET）", async () => {
    const calls = stubFetchCapture({ id: "img-1" }, 201);
    await createImage({ url: "https://a.test/x.jpg", title: "t", tags: [] }, "tok");
    const url = new URL(calls[0].url, "https://t.example.test");
    expect(url.searchParams.has("_t")).toBe(false);
  });
});

describe("updateImage", () => {
  it("PUT 到 /api/update/:id，只带调用方给的字段", async () => {
    const calls = stubFetchCapture({ id: "img-1" });
    await updateImage("img-1", { title: "新标题" }, "tok");

    const url = new URL(calls[0].url, "https://t.example.test");
    expect(url.pathname).toBe("/api/update/img-1");
    expect(calls[0].init?.method).toBe("PUT");
    // 未提供的字段不得以 undefined 形式出现（服务端按「字段缺失」判断不变）
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ title: "新标题" });
  });
});

describe("deleteImage", () => {
  it("DELETE 到 /api/delete/:id，带 Bearer 头且无 body", async () => {
    const calls = stubFetchCapture({ success: true });
    await deleteImage("img-1", "tok");

    const url = new URL(calls[0].url, "https://t.example.test");
    expect(url.pathname).toBe("/api/delete/img-1");
    expect(calls[0].init?.method).toBe("DELETE");
    expect(headersOf(calls[0].init).Authorization).toBe("Bearer tok");
    expect(calls[0].init?.body).toBeUndefined();
  });
});

describe("fetchImagesPage · 查询串构造", () => {
  it("page / pageSize 始终带上", async () => {
    const calls = stubFetchCapture({ items: [] });
    await fetchImagesPage({ page: 2, pageSize: 48 });
    const url = new URL(calls[0].url, "https://t.example.test");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("pageSize")).toBe("48");
    expect(url.searchParams.has("search")).toBe(false);
    expect(url.searchParams.has("tag")).toBe(false);
  });

  it("search 先 trim，空白搜索不写进查询串", async () => {
    const calls = stubFetchCapture({ items: [] });
    await fetchImagesPage({ page: 1, pageSize: 24, search: "   " });
    expect(new URL(calls[0].url, "https://t.example.test").searchParams.has("search")).toBe(false);

    await fetchImagesPage({ page: 1, pageSize: 24, search: "  猫  " });
    expect(new URL(calls[1].url, "https://t.example.test").searchParams.get("search")).toBe("猫");
  });

  it("tag 为 null / 空串时不写进查询串", async () => {
    const calls = stubFetchCapture({ items: [] });
    await fetchImagesPage({ page: 1, pageSize: 24, tag: null });
    await fetchImagesPage({ page: 1, pageSize: 24, tag: "" });
    await fetchImagesPage({ page: 1, pageSize: 24, tag: "acg" });
    const params = calls.map((call) => new URL(call.url, "https://t.example.test").searchParams);
    expect(params[0].has("tag")).toBe(false);
    expect(params[1].has("tag")).toBe(false);
    expect(params[2].get("tag")).toBe("acg");
  });

  it("列表查询不破缓（交给服务端 s-maxage）", async () => {
    const calls = stubFetchCapture({ items: [] });
    await fetchImagesPage({ page: 1, pageSize: 24 });
    const url = new URL(calls[0].url, "https://t.example.test");
    expect(url.searchParams.has("_t")).toBe(false);
    expect(calls[0].init?.cache).toBe("default");
  });
});
