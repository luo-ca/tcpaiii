import { afterEach, describe, expect, it, vi } from "vitest";
import { batchUpdateImageTags } from "@/lib/api";

/**
 * 批量改标签的 ids 上限必须在前端拦住（P144）。
 *
 * 服务端 handleBatchUpdateImageTags 有硬上限：
 *
 *   if (ids.length > MAX_BATCH_SIZE)   // 500
 *     return json({ error: `Maximum ${MAX_BATCH_SIZE} images per batch request` }, 400);
 *
 * 而 front-end 的勾选是**跨页保留**的（admin-page 的注释明确写了
 * 「勾选跨页保留（ids 与当前筛选无关）」），逐页点「本页全选」很容易超过 500。
 * 上线图库已 261 张且持续增长 —— 两页全选就过线。
 *
 * 撞上时的体验：请求发出后服务端 400，文案经映射表变成「单次批量数量超出上限」，
 * 但用户已经花力气勾了几百张，却只得到一句「超出上限」而没有「超了多少 / 上限多少」
 * 的可操作信息；更糟的是这批选择无法通过减少页数来补救，只能整批重来。
 *
 * 修法：提交前按同一上限预检，给出带具体数字的中文提示，直接不发请求。
 * 与 add-image-dialog 对「单次最多导入」的既有处理保持一致。
 */

function stubWindow() {
  vi.stubGlobal("window", {
    location: { origin: "https://t.example.test", pathname: "/admin", search: "", hash: "" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batchUpdateImageTags · ids 上限预检（P144）", () => {
  it("超过上限时前端直接拒发（不打服务端）", async () => {
    stubWindow();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const ids = Array.from({ length: 501 }, (_, i) => `img-${i}`);
    await expect(batchUpdateImageTags({ ids, addTags: ["x"] }, "tok")).rejects.toThrow(
      /超出上限|最多/,
    );
    expect(fetchSpy, "超限请求不该打到服务端").not.toHaveBeenCalled();
  });

  it("恰好等于上限时放行（边界不能误杀）", async () => {
    stubWindow();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ total: 1, success: 1, failed: 0, results: [{ success: true, id: "img-0" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const ids = Array.from({ length: 500 }, (_, i) => `img-${i}`);
    const r = await batchUpdateImageTags({ ids, addTags: ["x"] }, "tok");
    expect(r.success).toBe(1);
  });

  it("提示里带上具体数字（用户才知道要减多少）", async () => {
    stubWindow();
    vi.stubGlobal("fetch", vi.fn());

    const ids = Array.from({ length: 620 }, (_, i) => `img-${i}`);
    await expect(batchUpdateImageTags({ ids, addTags: ["x"] }, "tok")).rejects.toThrow(/620/);
  });
});