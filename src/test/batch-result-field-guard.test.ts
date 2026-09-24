import { afterEach, describe, expect, it, vi } from "vitest";
import { batchCreateImages } from "@/lib/api";

/**
 * 批量结果里的 url / error 字段也要归一化（P129）。
 *
 * P128 已把 results 的**元素**校验成「带布尔 success 的对象」，
 * 但元素内部的字段仍是任意值，而两个调用方都直接消费：
 *
 *   add-image-dialog:
 *     .map((item) => canonicalizeImageUrl(item.url))   // 内部 value.trim()
 *     {item.url} — {item.error ?? '失败'}               // JSX 直接渲染
 *
 * 于是：
 *   · item.url 是对象/数组 → canonicalizeImageUrl 抛
 *     'value.trim is not a function'（英文 TypeError）；
 *   · item.error 是对象     → React 抛
 *     'Objects are not valid as a React child'，把批量导入面板整块打下线。
 *
 * 失败项的 url 在服务端本就有可能是空串（Invalid image payload 分支
 * push 的是 url: ''），所以空串必须放行 —— 只把**类型**收口。
 */

function stubOnce(body: unknown) {
  vi.stubGlobal("window", {
    location: { origin: "https://t.example.test", pathname: "/admin", search: "", hash: "" },
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

const payload = [{ url: "https://cdn.example.test/a.jpg", title: "A", tags: ["x"] }];

describe("batchCreateImages · url / error 字段归一化（P129）", () => {
  it("url 是对象时收成空串，不再让 canonicalizeImageUrl 抛英文 TypeError", async () => {
    stubOnce({
      total: 1,
      success: 0,
      failed: 1,
      results: [{ success: false, url: { bad: 1 }, error: "URL must be a valid http(s) URL" }],
    });
    const r = await batchCreateImages(payload, "tok");
    expect(typeof r.results[0].url).toBe("string");
  });

  it("error 是对象时收成字符串，不再让 React 渲染对象而崩", async () => {
    stubOnce({
      total: 1,
      success: 0,
      failed: 1,
      results: [{ success: false, url: "https://cdn.example.test/a.jpg", error: { code: 1 } }],
    });
    const r = await batchCreateImages(payload, "tok");
    expect(typeof r.results[0].error === "string" || r.results[0].error === undefined).toBe(true);
  });

  it("失败项的空 url 合法（服务端 Invalid image payload 分支就是这样）", async () => {
    stubOnce({
      total: 1,
      success: 0,
      failed: 1,
      results: [{ success: false, url: "", error: "Invalid image payload" }],
    });
    const r = await batchCreateImages(payload, "tok");
    expect(r.results[0].url).toBe("");
    expect(r.success).toBe(0);
  });

  it("正常项的 url / id / error 原样保留", async () => {
    stubOnce({
      total: 2,
      success: 1,
      failed: 1,
      results: [
        { success: true, url: "https://cdn.example.test/a.jpg", id: "img-1" },
        { success: false, url: "https://cdn.example.test/b.jpg", error: "URL already exists" },
      ],
    });
    const r = await batchCreateImages(payload, "tok");
    expect(r.results[0].url).toBe("https://cdn.example.test/a.jpg");
    expect(r.results[0].id).toBe("img-1");
    expect(r.results[1].error).toBe("URL already exists");
  });
});