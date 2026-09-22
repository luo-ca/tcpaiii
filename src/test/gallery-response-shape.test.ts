import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchImagesPage } from "@/lib/api";

/**
 * fetchImagesPage 必须把响应归一化成 { items: [...] } 再交给调用方。
 *
 * 契约上分页请求返回 { items, page, ... }，但 /api/list 还有一条历史分支：
 * 「不带任何分页/筛选参数时返回旧版裸数组」（本文件之外的
 * fetchExistingImageUrlSet 就同时兼容两种形状：
 *   const records = Array.isArray(body) ? body : (body.items ?? []);
 * ）。
 *
 * 图库页却没有这层防御，直接：
 *   imagesQuery.data?.pages.flatMap((page) => page.items) ?? []
 * 一旦 items 缺失/非数组（或整体是裸数组），flatMap 会产出 **undefined 项** ——
 * 注意它不是抛错而是产出 [undefined]：
 *   · images.length === 1，isEmpty 判不出来，不会走空态；
 *   · 于是照常渲染图库网格，MasonryTile 读 image.url 时崩，
 *     整页落到错误边界，而不是干净的空态/错误态。
 *
 * 在 API 边界处收口，调用方就不必各写一套防御。
 */

const minimalImage = {
  id: "img-1",
  url: "https://cdn.example.test/a.jpg",
  title: "A",
  tags: ["x"],
  createdAt: "2026-01-01T00:00:00.000Z",
};

function stubFetchOnce(body: unknown) {
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

describe("fetchImagesPage · 响应形状归一化", () => {
  it("正常分页响应原样透传", async () => {
    stubFetchOnce({
      items: [minimalImage],
      page: 2,
      pageSize: 24,
      total: 50,
      totalPages: 3,
      hasPrevPage: true,
      hasNextPage: true,
    });
    const page = await fetchImagesPage({ page: 2, pageSize: 24 });
    expect(page.items).toHaveLength(1);
    expect(page.page).toBe(2);
    expect(page.total).toBe(50);
    expect(page.hasNextPage).toBe(true);
  });

  it("裸数组包成 items，不再让 undefined 混进列表", async () => {
    stubFetchOnce([minimalImage]);
    const page = await fetchImagesPage({ page: 1, pageSize: 24 });
    expect(Array.isArray(page.items)).toBe(true);
    expect(page.items).toHaveLength(1);
    expect(page.items.every(Boolean), "出现 undefined 项会让 MasonryTile 崩").toBe(true);
  });

  it("items 缺失时给空数组而不是 undefined 项", async () => {
    stubFetchOnce({ total: 0, page: 1 });
    const page = await fetchImagesPage({ page: 1, pageSize: 24 });
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });

  it("items 非数组时同样收成空数组", async () => {
    stubFetchOnce({ items: null, total: 3 });
    const page = await fetchImagesPage({ page: 1, pageSize: 24 });
    expect(page.items).toEqual([]);
  });
});
