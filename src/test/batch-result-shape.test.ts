import { afterEach, describe, expect, it, vi } from "vitest";
import { batchCreateImages, batchUpdateImageTags } from "@/lib/api";

/**
 * 批量接口结果必须归一化，不能让英文 TypeError 漏给管理员。
 *
 * 两个弹窗都直接读 result.success / result.failed / result.results.filter(...)：
 *   add-image-dialog:   result.results.filter(item => !item.success)
 *   batch-tags-dialog:  data.success / data.failed
 * 而这两个 api 函数的 Promise<{...}> 只是**类型注解**，运行时并不校验 ——
 * apiRequest 返回什么就是什么。
 *
 * 实测（复现脚本）响应体缺 results 时：
 *   -> THROWS: Cannot read properties of undefined (reading 'filter')
 * 它被 catch 后经 getErrorMessage 原样弹给管理员 —— 一句与真实情况无关的
 * 英文 TypeError，而不是「服务端返回的结果格式异常」。
 *
 * 修法：在 API 边界收口。results 不是数组就抛明确的中文错误；
 * 计数字段类型不对则从 results 推导（success 数得出来，failed 可算）。
 */

function stubFetchOnce(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const images = [{ url: "https://cdn.example.test/a.jpg", title: "A", tags: ["x"] }];

describe("批量接口 · 结果归一化", () => {
  it("正常响应原样透传", async () => {
    stubFetchOnce({
      total: 2,
      success: 1,
      failed: 1,
      results: [
        { success: true, url: "https://cdn.example.test/a.jpg" },
        { success: false, url: "https://cdn.example.test/b.jpg", error: "dup" },
      ],
    });
    const r = await batchCreateImages(images, "tok");
    expect(r.total).toBe(2);
    expect(r.success).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.results).toHaveLength(2);
    // 调用方要能安全 .filter
    expect(r.results.filter((x) => !x.success)).toHaveLength(1);
  });

  it("results 缺失时抛出可读的中文错误（而不是英文 TypeError）", async () => {
    stubFetchOnce({ total: 1, success: 1, failed: 0 });
    await expect(batchCreateImages(images, "tok")).rejects.toThrow(
      /服务端返回的结果格式异常/,
    );
    await expect(batchCreateImages(images, "tok")).rejects.not.toThrow(/reading 'filter'/);
  });

  it("results 为 null 时同样", async () => {
    stubFetchOnce({ total: 1, success: 0, failed: 1, results: null });
    await expect(batchUpdateImageTags({ ids: ["a"] }, "tok")).rejects.toThrow(
      /服务端返回的结果格式异常/,
    );
  });

  it("计数字段类型不对时从 results 推导", async () => {
    stubFetchOnce({
      total: "lots",
      success: null,
      failed: undefined,
      results: [{ success: true }, { success: false }, { success: true }],
    });
    const r = await batchCreateImages(images, "tok");
    expect(r.total).toBe(3);
    expect(r.success).toBe(2);
    expect(r.failed).toBe(1);
  });
});
