import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStats } from "@/lib/api";

/**
 * fetchStats 的 tags 元素也要过形状守卫（P130）。
 *
 * P117 只把「tags 不是数组」收成了空数组：
 *
 *   const tags = Array.isArray(body?.tags) ? body.tags : [];
 *
 * 但 `[{bad:1}, 2, "风景"]` 也是数组，于是脏元素被原样放行。三处消费者
 * 直接把它当 React 子元素渲染：
 *   · gallery-browse 的标签筛选条 <TagChip>{tag}</TagChip>
 *   · admin-page 的标签筛选条 {tags.map((tag) => ... <TagChip>{tag}</TagChip>)}
 *   · OnlinePreview 的标签条 {stats?.tags?.map((tag) => <TagChip>{tag}</TagChip>)}
 * React 对 object 子元素直接抛 "Objects are not valid as a React child"。
 *
 * 实测（真实构建产物 + 桩让 /api/stats 返回 tags: [{bad:1}, 2, "风景"]）：
 *   /        整页崩到「页面出错了」
 *   /gallery 整页崩到「页面出错了」
 *   /admin   整页崩到「页面出错了」
 *
 * 与 P123（列表项 tags 元素）、P124（随机图 tags 元素）同一类口子：
 * 容器类型对了，元素没查。非字符串元素一律滤掉 —— 少一个标签远好过整页白给。
 */

function stubWindow() {
  vi.stubGlobal("window", {
    location: { origin: "https://example.test", pathname: "/", search: "", hash: "" },
  });
}

function stubFetchOnce(body: unknown) {
  stubWindow();
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

describe("fetchStats · tags 元素守卫（P130）", () => {
  it("tags 含 object / number 元素时只保留字符串，不再让整页崩", async () => {
    stubFetchOnce({ tags: [{ bad: 1 }, 2, "风景"], totalRequests: 1 });
    const s = await fetchStats();
    expect(s.tags).toEqual(["风景"]);
    expect(s.tags.every((t) => typeof t === "string")).toBe(true);
  });

  it("tags 全是脏元素时收成空数组（三条筛选条都不渲染）", async () => {
    stubFetchOnce({ tags: [{ a: 1 }, null, [], {}], totalRequests: 1 });
    const s = await fetchStats();
    expect(s.tags).toEqual([]);
  });

  it("正常 tags 原样保留顺序", async () => {
    stubFetchOnce({ tags: ["acg", "二次元"], totalRequests: 1 });
    const s = await fetchStats();
    expect(s.tags).toEqual(["acg", "二次元"]);
  });

  it("tags 非数组时仍收成空数组（回归闸）", async () => {
    stubFetchOnce({ tags: "acg" });
    const s = await fetchStats();
    expect(s.tags).toEqual([]);
  });
});