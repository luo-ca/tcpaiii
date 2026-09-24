import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRandomImage } from "@/lib/api";

/**
 * /api/random 的返回体也要过形状守卫（P124）。
 *
 * OnlinePreview 拿到随机图后直接 `setImageTags(img.tags)`，模板里再
 * `imageTags.map(...)` 渲染。`fetchRandomImage` 原先只是把响应原样返回，
 * 完全没校验：脏 tags（如 `[{bad:1}]`）会让 React 因 object 子元素抛错。
 *
 * 用桩实测（/api/random 返回 tags: [{bad:1}, 2]）：首页整页崩到「页面出错了」。
 *
 * 修法：与 fetchImagesPage 共用 isImageRecord；不合格就抛一条人能看懂的中文错误，
 * 在线预览会走已有的「预览加载失败 + 重试」兜底，而不是整页白给。
 */

function stubOnce(body: unknown) {
  vi.stubGlobal("window", {
    location: { origin: "https://t.example.test", pathname: "/", search: "", hash: "" },
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

const good = {
  id: "r1",
  url: "https://cdn.example.com/a.jpg",
  title: "随机图",
  tags: ["风景"],
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("fetchRandomImage · 形状守卫", () => {
  it("tags 含 object 时抛中文错误（不再让整页崩）", async () => {
    stubOnce({ ...good, tags: [{ bad: 1 }, 2] });
    await expect(fetchRandomImage()).rejects.toThrow(/格式异常/);
  });

  it("tags 是字符串（非数组）时同样拒绝", async () => {
    stubOnce({ ...good, tags: "风景" });
    await expect(fetchRandomImage()).rejects.toThrow(/格式异常/);
  });

  it("缺字段时拒绝", async () => {
    stubOnce({ id: "r1" });
    await expect(fetchRandomImage()).rejects.toThrow(/格式异常/);
  });

  it("正常数据原样返回", async () => {
    stubOnce(good);
    const img = await fetchRandomImage("风景");
    expect(img.id).toBe("r1");
    expect(img.tags).toEqual(["风景"]);
  });
});
