import { afterEach, describe, expect, it, vi } from "vitest";
import { batchCreateImages } from "@/lib/api";

/**
 * 批量接口的结果数组元素也要过形状守卫（P128）。
 *
 * normalizeBatchResult 原先只校验 `Array.isArray(raw.results)`：
 * results 里的**每一项**从没校验。而两个调用方都直接读 `item.success`：
 *
 *   add-image-dialog:
 *     result.results.filter((item) => item.success).map((item) => item.url)
 *   batch-update-tags-dialog 同理，normalizeBatchResult 内部也读 item?.success
 *
 * 一条 `null`（或 `"x"` 这类非对象）元素就会让调用方的 `.filter((item) => item.success)`
 * 抛 `Cannot read properties of null (reading 'success')` —— 英文 TypeError
 * 经 getErrorMessage 原样弹给管理员，而不是可理解的失败提示。
 *
 * 这与 P123（tags 元素类型）是同一类漏网口子：只挡了容器类型，没挡元素。
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

describe("batchCreateImages · results 元素形状守卫（P128）", () => {
  it("results 含 null 元素时抛中文错误，而不是英文 TypeError", async () => {
    stubOnce({
      total: 2,
      success: 1,
      failed: 1,
      results: [{ success: true, url: "https://cdn.example.test/a.jpg" }, null],
    });
    await expect(batchCreateImages(payload, "tok")).rejects.toThrow(/格式异常/);
  });

  it("results 含字符串元素时同样拒绝", async () => {
    stubOnce({ total: 1, success: 1, failed: 0, results: ["ok"] });
    await expect(batchCreateImages(payload, "tok")).rejects.toThrow(/格式异常/);
  });

  it("results 元素缺少 success 字段时拒绝（调用方按布尔读它）", async () => {
    stubOnce({ total: 1, success: 1, failed: 0, results: [{ url: "https://x.test/a.jpg" }] });
    await expect(batchCreateImages(payload, "tok")).rejects.toThrow(/格式异常/);
  });

  it("形状正常时照常返回，且不丢条目", async () => {
    stubOnce({
      total: 2,
      success: 1,
      failed: 1,
      results: [
        { success: true, url: "https://cdn.example.test/a.jpg", id: "img-1" },
        { success: false, url: "https://cdn.example.test/b.jpg", error: "URL already exists" },
      ],
    });
    const result = await batchCreateImages(payload, "tok");
    expect(result.results).toHaveLength(2);
    expect(result.success).toBe(1);
    expect(result.failed).toBe(1);
  });
});