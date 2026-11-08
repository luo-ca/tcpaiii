import { describe, expect, it } from "vitest";

import { corsHeaders, json, noStoreHeaders } from "../../edge-functions-src/lib/response";
import { READ_CACHE_CONTROL } from "../../edge-functions-src/lib/types";

/**
 * 边缘响应的两个头部契约。
 *
 * `json()` 是所有 /api/* 响应的唯一出口，它同时承担三件事：
 *   · 可缓存读接口（stats / 分页 list）显式开 s-maxage 口子；
 *   · 其余（含全部错误响应）走全套 no-store；
 *   · **无条件**带 X-Content-Type-Options: nosniff —— 某些老浏览器会对顶层
 *     导航做 MIME 嗅探，把回显用户输入的 JSON 当 HTML 解析成 XSS。
 *
 * 前两条此前只经端到端用例间接验证。nosniff 的端到端断言在
 * functions-api.test.ts（404 回显与 /api/stats 两条路径），这里不重复，
 * 只补本文件独有的头部契约：可缓存分支的 cache-control 取值、错误码
 * 不可缓存、调用方追加头不得覆盖安全头。
 */

describe("noStoreHeaders", () => {
  const headers = noStoreHeaders();

  it("禁止各级缓存", () => {
    expect(headers["Cache-Control"]).toContain("no-store");
    expect(headers["CDN-Cache-Control"]).toBe("no-store");
    expect(headers["Surrogate-Control"]).toBe("no-store");
    expect(headers.Pragma).toBe("no-cache");
    expect(headers.Expires).toBe("0");
  });

  it("自带 nosniff（不依赖 CDN 的 /* 规则）", () => {
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  });
});

describe("corsHeaders", () => {
  it("允许本站用到的全部方法与 Authorization 头", () => {
    const headers = corsHeaders();
    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
    for (const method of ["GET", "POST", "PUT", "DELETE", "OPTIONS"]) {
      expect(headers["Access-Control-Allow-Methods"]).toContain(method);
    }
    expect(headers["Access-Control-Allow-Headers"]).toContain("Authorization");
  });
});

describe("json()", () => {
  it("默认走全套 no-store 并带 nosniff", async () => {
    const response = json({ ok: true });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("可缓存分支用调用方给的 cacheControl，且不残留 no-store", async () => {
    const response = json({ items: [] }, 200, { cacheControl: READ_CACHE_CONTROL });
    expect(response.headers.get("cache-control")).toBe(READ_CACHE_CONTROL);
    expect(response.headers.get("cdn-cache-control")).toBe(READ_CACHE_CONTROL);
    // 可缓存分支不该残留 no-store —— 否则边缘缓存形同虚设
    expect(response.headers.get("cache-control")).not.toContain("no-store");
  });

  it("错误状态码同样不可缓存", async () => {
    const response = json({ error: "Not Found" }, 404);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("允许追加自定义头，且不覆盖安全头", async () => {
    const response = json({}, 429, { headers: { "Retry-After": "3" } });
    expect(response.headers.get("retry-after")).toBe("3");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("调用方同名头盖不掉 nosniff 与 content-type", async () => {
    const response = json({}, 200, {
      headers: { "X-Content-Type-Options": "sniff", "Content-Type": "text/html" },
    });
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-type")).toBe("application/json");
  });

  it("可缓存分支不被调用方的 cache-control 拖回不可缓存（大小写两个变体）", () => {
    // Headers 对同名头是拼接而非覆盖：一段 no-store 混进来，CDN 就再也不缓存了。
    for (const name of ["Cache-Control", "cache-control"]) {
      const response = json({ items: [] }, 200, {
        cacheControl: READ_CACHE_CONTROL,
        headers: { [name]: "no-store" },
      });
      expect(response.headers.get("cache-control"), name).toBe(READ_CACHE_CONTROL);
      expect(response.headers.get("cache-control"), name).not.toContain("no-store");
    }
  });

  it("调用方也盖不掉 cdn-cache-control 与 vary（同属 cacheControl 分支）", () => {
    const response = json({ items: [] }, 200, {
      cacheControl: READ_CACHE_CONTROL,
      headers: { "CDN-Cache-Control": "no-store", Vary: "Origin" },
    });
    expect(response.headers.get("cdn-cache-control")).toBe(READ_CACHE_CONTROL);
    expect(response.headers.get("vary")).toBe("Accept, Accept-Encoding");
  });

  it("body 序列化为 JSON 文本（数组、null、基本类型都不失真）", async () => {
    await expect(json([1, 2]).json()).resolves.toEqual([1, 2]);
    await expect(json(null).json()).resolves.toBeNull();
    await expect(json("x").json()).resolves.toBe("x");
  });
});
