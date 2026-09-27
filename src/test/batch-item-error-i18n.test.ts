import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { batchCreateImages } from "@/lib/api";

/**
 * 批量导入的**逐条**错误也必须中文化（P190）。
 *
 * 顶层错误走 apiRequest -> translateServerError，是中文的。
 * 但 /api/batch 成功时的**逐条** results[].error 是另一条路径：
 * api.ts 只做了类型收窄（record.error 是 string 就留着），
 * 文案原样透传，最终由 add-image-dialog 直接渲染：
 *
 *   {item.url} — {item.error ?? '失败'}
 *
 * 于是服务端的 'URL must be a valid http(s) URL' / 'URL exceeds 2048 characters'
 * / 'URL already exists' / 'Invalid image payload' 全都以英文出现在中文界面上。
 *
 * server-error-i18n-coverage.test.ts 覆盖不到这里：它把每条文案当成**顶层**
 * 错误喂给 apiRequest，只验证「映射表里有这条」，从未验证逐条错误真的过了映射。
 */

function stubWindow() {
  vi.stubGlobal("window", {
    location: { origin: "https://t.example.test", pathname: "/admin", search: "", hash: "" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 让 /api/batch 回一份带逐条错误的成功响应（201） */
function stubBatchResponse(results: Array<{ success: boolean; url: string; error?: string }>) {
  stubWindow();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          total: results.length,
          success: results.filter((r) => r.success).length,
          failed: results.filter((r) => !r.success).length,
          results,
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    ),
  );
}

describe("批量逐条错误中文化（P190）", () => {
  it("results[].error 也要译成中文（这正是原先漏掉的那条路径）", async () => {
    stubBatchResponse([
      { success: false, url: "https://a.test/x.jpg", error: "URL must be a valid http(s) URL" },
      { success: false, url: "https://a.test/y.jpg", error: "URL already exists" },
      { success: true, url: "https://a.test/ok.jpg" },
    ]);

    const result = await batchCreateImages(
      [{ url: "https://a.test/x.jpg", title: "t", tags: [] }],
      "token",
    );

    const shown = result.results.filter((r) => !r.success).map((r) => r.error ?? "");
    expect(shown).toHaveLength(2);
    for (const msg of shown) {
      // 「连续 3 个以上纯 ASCII 单词」即视为英文句子（与既有护栏同一判据）
      const stripped = msg.replace(/\b(URL|ID|JSON|API|KV|ESA|ADMIN_TOKEN)\b/g, "");
      expect(stripped, `未中文化：${msg}`).not.toMatch(/(?:[A-Za-z][A-Za-z'’-]*\s+){2,}[A-Za-z][A-Za-z'’-]*/);
      expect(msg, `应含中文：${msg}`).toMatch(/[\u4e00-\u9fa5]/);
    }
  });

  it("超长与格式错误在逐条错误里也是**不同**的中文（P189 的修法同样适用）", async () => {
    stubBatchResponse([
      { success: false, url: "https://a.test/x.jpg", error: "URL must be a valid http(s) URL" },
      { success: false, url: "https://a.test/y.jpg", error: "URL exceeds 2048 characters" },
    ]);

    const result = await batchCreateImages([{ url: "https://a.test/x.jpg", title: "t", tags: [] }], "token");
    const [invalid, tooLong] = result.results.map((r) => r.error ?? "");

    expect(invalid).not.toBe(tooLong);
    expect(tooLong).toContain("太长");
    expect(invalid).toContain("有效");
  });

  it("带捕获组的逐条错误也保留用户输入（$1 回填）", async () => {
    stubBatchResponse([
      { success: false, url: "https://a.test/x.jpg", error: "No images found with tag: acg" },
    ]);

    const result = await batchCreateImages([{ url: "https://a.test/x.jpg", title: "t", tags: [] }], "token");
    const shown = result.results[0].error ?? "";
    expect(shown, "标签名应被回填").toContain("acg");
    expect(shown, "外壳应中文化").not.toContain("No images found");
  });

  /**
   * 扫**真实服务端源码**里所有逐条错误字面量（results.push({ ... error: '...' })），
   * 逐个走一遍批量响应，断言都是中文。
   *
   * 这条是活护栏：将来在 images.ts 新增一条逐条文案却忘了补映射，这里会红。
   * 与 server-error-i18n-coverage.test.ts 的分工 —— 那条扫顶层 error，
   * 这条扫逐条 error，两条路径互不覆盖，缺一条就有盲区。
   */
  it("服务端每一条逐条错误文案都已中文化（扫源码，防止将来漏加）", async () => {
    const src = readFileSync("edge-functions-src/lib/images.ts", "utf8");
    const found = new Set<string>();
    for (const m of src.matchAll(/error:\s*'([^']+)'/g)) found.add(m[1]);
    for (const m of src.matchAll(/error:\s*`([^`]+)`/g)) found.add(m[1]);
    // 占位符换成真实值形态（与既有护栏同一处理）
    const msgs = [...found]
      .map((s) => s.trim())
      .filter((s) => s && !s.includes("\n") && /^[A-Za-z]/.test(s))
      .map((s) => s.replace(/\$\{[^}]*\}/g, "1"));

    expect(msgs.length, "扫到的逐条文案数不该这么少（防扫描失效）").toBeGreaterThan(3);

    const leaked: Array<{ server: string; shown: string }> = [];
    for (const server of msgs) {
      stubBatchResponse([{ success: false, url: "https://a.test/x.jpg", error: server }]);
      const result = await batchCreateImages(
        [{ url: "https://a.test/x.jpg", title: "t", tags: [] }],
        "token",
      );
      const shown = result.results[0].error ?? "";
      const stripped = shown.replace(/\b(URL|ID|JSON|API|KV|ESA|ADMIN_TOKEN)\b/g, "");
      if (/(?:[A-Za-z][A-Za-z'’-]*\s+){2,}[A-Za-z][A-Za-z'’-]*/.test(stripped)) {
        leaked.push({ server, shown });
      }
    }
    expect(leaked, "以下逐条文案没有中文映射：\n" + JSON.stringify(leaked, null, 2)).toEqual([]);
  });
});
