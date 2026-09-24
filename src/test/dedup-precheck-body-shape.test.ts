import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchExistingImageUrlSet } from "@/lib/api";

/**
 * 批量导入预检还必须挡住「响应体本身形状不对」（P122）。
 *
 * P121 给列表项加了 isImageRecord 守卫，但表达式本身还是
 *   `Array.isArray(body) ? body : (body.items ?? [])`
 * —— 当**响应体是 JSON `null`** 时，`body.items` 直接抛
 * `Cannot read properties of null (reading 'items')`。已用单测复现。
 *
 * 后果与 P121 相同：整个去重预检失败 → 界面提示
 * 「库内地址读取失败：暂时无法判断哪些是全新地址，导入会被拦下」→
 * 管理员导不进任何图片。
 *
 * 修法：非数组、非对象、items 非数组，一律当空集合
 *（没有可去重的历史地址，不该阻断导入）。
 */

const good = {
  id: "img-1",
  url: "https://cdn.example.com/a.jpg",
  title: "A",
  tags: ["x"],
  createdAt: "2026-01-01T00:00:00.000Z",
};

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

describe("去重预检 · 响应体形状异常不阻断导入", () => {
  it("响应体是 JSON null 时不抛错，返回空集合", async () => {
    stubOnce(null);
    const set = await fetchExistingImageUrlSet();
    expect(set.size).toBe(0);
  });

  it("响应体是字符串 / 数字时不抛错", async () => {
    stubOnce("oops");
    expect((await fetchExistingImageUrlSet()).size).toBe(0);
    stubOnce(42);
    expect((await fetchExistingImageUrlSet()).size).toBe(0);
  });

  it("对象缺 items / items 非数组时返回空集合", async () => {
    stubOnce({ total: 2 });
    expect((await fetchExistingImageUrlSet()).size).toBe(0);
    stubOnce({ items: null });
    expect((await fetchExistingImageUrlSet()).size).toBe(0);
    stubOnce({ items: "x" });
    expect((await fetchExistingImageUrlSet()).size).toBe(0);
  });

  it("正常 { items } 与裸数组仍照常工作", async () => {
    stubOnce({ items: [good], page: 1, pageSize: 24, total: 1, totalPages: 1 });
    expect((await fetchExistingImageUrlSet()).size).toBe(1);
    stubOnce([good]);
    expect((await fetchExistingImageUrlSet()).size).toBe(1);
  });
});
