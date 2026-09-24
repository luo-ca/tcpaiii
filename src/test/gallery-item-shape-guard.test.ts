import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchImagesPage } from "@/lib/api";

/**
 * 列表项要做运行时形状守卫，一条脏数据不能拖垮整页（P120）。
 *
 * fetchImagesPage 此前只校验**容器**是数组（P74–P77 那轮补的归一化），
 * 不校验**元素**：`items: [null, {...}]` 里的 null 会一路进到 MasonryTile，
 * 读 image.url 时抛错，路由级错误边界接管 → 整页变「页面出错了」。
 *
 * 用桩实测（items 里塞一条 null）：
 *   修复前：/gallery 与 / 都显示「页面出错了 / 这一块没能正常显示」
 *   修复后：正常渲染，脏项被滤掉，好数据照常显示
 *
 * 修法：在边界过滤掉不满足最低形状（id/url/title 为 string、tags 为数组）的项。
 * 少一张图远好过整页白给。
 */

const good = {
  id: "img-1",
  url: "https://cdn.example.test/a.jpg",
  title: "A",
  tags: ["x"],
  createdAt: "2026-01-01T00:00:00.000Z",
};

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

describe("fetchImagesPage · 列表项形状守卫", () => {
  it("items 里的 null 被滤掉（否则渲染时崩溃）", async () => {
    stubOnce({ items: [null, good], page: 1, pageSize: 24, total: 2, totalPages: 1 });
    const page = await fetchImagesPage({ page: 1, pageSize: 24 });
    expect(page.items).toHaveLength(1);
    expect(page.items.every(Boolean), "null 混进 items 会让 MasonryTile 崩溃").toBe(true);
  });

  it("缺字段 / 字段类型不对的项同样被滤掉", async () => {
    stubOnce({
      items: [
        { id: 1, url: null, title: {}, tags: "x" },
        { id: "ok", url: "/a.jpg", title: "正常", tags: ["风景"] },
        good,
      ],
      page: 1, pageSize: 24, total: 3, totalPages: 1,
    });
    const page = await fetchImagesPage({ page: 1, pageSize: 24 });
    expect(page.items).toHaveLength(2);
  });

  it("裸数组形状同样过滤（历史分支也要守）", async () => {
    stubOnce([null, good]);
    const page = await fetchImagesPage({ page: 1, pageSize: 24 });
    expect(page.items).toHaveLength(1);
  });

  it("全部合法时原样保留", async () => {
    stubOnce({ items: [good], page: 1, pageSize: 24, total: 1, totalPages: 1 });
    const page = await fetchImagesPage({ page: 1, pageSize: 24 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].id).toBe("img-1");
  });
});
