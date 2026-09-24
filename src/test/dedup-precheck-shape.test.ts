import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchExistingImageUrlSet } from "@/lib/api";

/**
 * 批量导入的「库内地址」预检也要过形状守卫（P121）。
 *
 * fetchExistingImageUrlSet 用于批量导入前的去重预检：把库里已有 URL 收成 Set。
 * 原先直接 `record.url` —— 一条 null 就抛
 * `Cannot read properties of null (reading 'url')`（已用单测复现）。
 *
 * 后果不是「少判一条重复」，而是整个预检查询失败：界面显示
 * 「库内地址读取失败：暂时无法判断哪些是全新地址，导入会被拦下」，
 * 管理员**从此导不进任何图片**，只因为库里有一条脏数据。
 *
 * 修法：与 fetchImagesPage 用同一个 isImageRecord 守卫，跳过脏项。
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

describe("批量导入去重预检 · 脏项不再让预检整体失败", () => {
  it("items 含 null 时不抛错，好数据仍被收进集合", async () => {
    stubOnce({ items: [null, good], page: 1, pageSize: 24, total: 2, totalPages: 1 });
    const set = await fetchExistingImageUrlSet();
    expect(set.size, "好数据应被收进去重集合").toBe(1);
    expect(set.has("https://cdn.example.com/a.jpg")).toBe(true);
  });

  it("缺字段的项被跳过，不影响其余项", async () => {
    stubOnce({
      items: [{ id: "b" }, { id: 1, url: null }, good],
      page: 1, pageSize: 24, total: 3, totalPages: 1,
    });
    const set = await fetchExistingImageUrlSet();
    expect(set.size).toBe(1);
  });

  it("裸数组形状同样安全", async () => {
    stubOnce([null, good]);
    const set = await fetchExistingImageUrlSet();
    expect(set.size).toBe(1);
  });

  it("全部合法时全部收进（不改变正常行为）", async () => {
    stubOnce([good, { ...good, id: "img-2", url: "https://cdn.example.com/b.jpg" }]);
    const set = await fetchExistingImageUrlSet();
    expect(set.size).toBe(2);
  });
});
