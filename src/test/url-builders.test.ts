import { afterEach, describe, expect, it, vi } from "vitest";

import { appendCurrentPreviewParams, buildApiPath, buildAppUrl, getAppOrigin } from "@/lib/url";
import { APP_FALLBACK_DOMAIN } from "@/lib/constants";

/**
 * 地址构造层。
 *
 * 这两条路径服务不同目的：
 *   · buildAppUrl —— 给用户看/复制的**绝对**地址（文档示例、分享链接）；
 *   · buildApiPath —— 实际发请求用的站内路径（相对，保留预览参数）。
 *
 * 共同契约：预览链接（`?eo_token=…`）上的每一个地址都必须带上这组参数，
 * 否则用户从预览页复制出去的示例、或页面发出的请求，都会落到线上部署。
 */

function stubWindow(search = "", origin = "https://preview.example.test") {
  vi.stubGlobal("window", {
    location: { origin, pathname: "/gallery", search, hash: "" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getAppOrigin", () => {
  it("有 window 时取当前 origin", () => {
    stubWindow("", "https://preview.example.test");
    expect(getAppOrigin()).toBe("https://preview.example.test");
  });

  it("无 window（构建/SSR 期）时回退到站点常量", () => {
    vi.stubGlobal("window", undefined);
    expect(getAppOrigin()).toBe(APP_FALLBACK_DOMAIN);
  });
});

describe("appendCurrentPreviewParams", () => {
  it("把当前地址里的 eo_token / eo_time 补进目标 URL", () => {
    stubWindow("?eo_token=abc&eo_time=123");
    const url = appendCurrentPreviewParams(new URL("https://x.test/api/random"));
    expect(url.searchParams.get("eo_token")).toBe("abc");
    expect(url.searchParams.get("eo_time")).toBe("123");
  });

  it("目标已带同名参数时不覆盖（显式指定优先）", () => {
    stubWindow("?eo_token=from-current");
    const url = appendCurrentPreviewParams(
      new URL("https://x.test/api/random?eo_token=explicit"),
    );
    expect(url.searchParams.get("eo_token")).toBe("explicit");
  });

  it("非预览链接时 URL 不被污染", () => {
    stubWindow("");
    const url = appendCurrentPreviewParams(new URL("https://x.test/api/random"));
    expect(url.toString()).toBe("https://x.test/api/random");
  });

  it("无 window 时原样返回（不抛错）", () => {
    vi.stubGlobal("window", undefined);
    const url = new URL("https://x.test/api/random");
    expect(appendCurrentPreviewParams(url)).toBe(url);
  });
});

describe("buildAppUrl", () => {
  it("拼出绝对地址（给文档示例与分享用）", () => {
    stubWindow("");
    expect(buildAppUrl("/")).toBe("https://preview.example.test/");
    expect(buildAppUrl("/api/random")).toBe("https://preview.example.test/api/random");
  });

  it("带上当前页的预览参数，保证示例在预览环境可复现", () => {
    stubWindow("?eo_token=abc&eo_time=123");
    const url = new URL(buildAppUrl("/api/random?tag=acg"));
    expect(url.searchParams.get("tag")).toBe("acg");
    expect(url.searchParams.get("eo_token")).toBe("abc");
    expect(url.searchParams.get("eo_time")).toBe("123");
  });

  it("无 window 时以站点常量兜底", () => {
    vi.stubGlobal("window", undefined);
    expect(buildAppUrl("/docs")).toBe(`${APP_FALLBACK_DOMAIN}/docs`);
  });
});

describe("buildApiPath", () => {
  it("返回站内相对路径（不带 origin），保证同源请求", () => {
    stubWindow("");
    expect(buildApiPath("/api/random")).toBe("/api/random");
    expect(buildApiPath("/api/list?page=1")).toBe("/api/list?page=1");
  });

  it("保留预览参数与 hash", () => {
    stubWindow("?eo_token=abc");
    expect(buildApiPath("/api/random?format=json#x")).toBe(
      "/api/random?format=json&eo_token=abc#x",
    );
  });

  it("无 window 时原样返回路径", () => {
    vi.stubGlobal("window", undefined);
    expect(buildApiPath("/api/random")).toBe("/api/random");
  });
});
