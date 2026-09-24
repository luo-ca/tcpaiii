import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchImagesPage } from "@/lib/api";

/**
 * 形状守卫还要查 tags 的**元素**（P123）。
 *
 * P120 给列表项加了守卫，但 `Array.isArray(item.tags)` 只保证 tags 是数组，
 * 不保证元素是字符串。`tags: [{bad:1}]` 能顺利通过，然后：
 *   · MasonryTile 渲染 `{image.tags[0]}` → object 作为 React child 抛错
 *   · 灯箱 `image.tags.map(...)` → 同样抛错
 *
 * 用桩实测：/gallery 与 / 都整页崩到「页面出错了」。
 *
 * 修法：`item.tags.every(t => typeof t === 'string')`。
 */

const base = { id: "a", url: "/a.jpg", title: "A", createdAt: "2026-01-01" };

function stubOnce(body: unknown) {
  vi.stubGlobal("window", {
    location: { origin: "https://t.example.test", pathname: "/gallery", search: "", hash: "" },
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

function pageOf(items: unknown[]) {
  stubOnce({ items, page: 1, pageSize: 24, total: items.length, totalPages: 1 });
  return fetchImagesPage({ page: 1, pageSize: 24 });
}

describe("形状守卫 · tags 元素非字符串的项被滤掉", () => {
  it("tags: [{}] 不再放行（否则 React 渲染 object 会崩整页）", async () => {
    const page = await pageOf([{ ...base, tags: [{}] }]);
    expect(page.items, "object 标签会让 MasonryTile/灯箱抛错").toHaveLength(0);
  });

  it("tags: [1, 2] 同样被拒", async () => {
    const page = await pageOf([{ ...base, tags: [1, 2] }]);
    expect(page.items).toHaveLength(0);
  });

  it("混入一个非字符串元素即整项拒绝（不做部分保留）", async () => {
    const page = await pageOf([{ ...base, tags: ["风景", { bad: 1 }] }]);
    expect(page.items).toHaveLength(0);
  });

  it("纯字符串标签（含空数组）照常通过", async () => {
    const page = await pageOf([
      { ...base, id: "a", tags: ["风景", "acg"] },
      { ...base, id: "b", tags: [] },
    ]);
    expect(page.items).toHaveLength(2);
  });
});
