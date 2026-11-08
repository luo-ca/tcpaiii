import { describe, expect, it } from "vitest";

import { normalizeTags, normalizeTitle } from "../../edge-functions-src/lib/validation";
import { MAX_TAG_LENGTH, MAX_TAGS_PER_IMAGE, MAX_TITLE_LENGTH } from "../../edge-functions-src/lib/types";

/**
 * 服务端标题 / 标签归一化的「入库契约」。
 *
 * 控制字符剔除已由 server-control-chars.test.ts 钉住；这里补的是另一组
 * 边界：缺失与非法输入的三态区分、截断上限、去重与数量封顶。
 *
 * 这些决定了「提交什么就存什么」是否成立：前端表单按同一组常量封顶，
 * 服务端静默截断。两侧不一致时，用户输入的和落库的会悄悄不同。
 */

describe("normalizeTitle", () => {
  it("非字符串回退到默认名", () => {
    for (const value of [undefined, null, 42, {}, []]) {
      expect(normalizeTitle(value)).toBe("未命名图片");
    }
  });

  it("空串与纯空白回退到默认名", () => {
    expect(normalizeTitle("")).toBe("未命名图片");
    expect(normalizeTitle("   ")).toBe("未命名图片");
  });

  it("两端空白被裁掉", () => {
    expect(normalizeTitle("  风景图  ")).toBe("风景图");
  });

  it("超长标题截到 MAX_TITLE_LENGTH", () => {
    const long = "标".repeat(MAX_TITLE_LENGTH + 20);
    expect(normalizeTitle(long)).toHaveLength(MAX_TITLE_LENGTH);
  });

  it("调用方可以指定自己的回退名（update 分支保持原值）", () => {
    expect(normalizeTitle(undefined, "原标题")).toBe("原标题");
    expect(normalizeTitle("", "原标题")).toBe("原标题");
  });
});

describe("normalizeTags", () => {
  it("undefined 表示「未提供」，归一为空数组", () => {
    expect(normalizeTags(undefined)).toEqual([]);
  });

  it("非数组或含非字符串元素时返回 null（调用方回 400）", () => {
    expect(normalizeTags("acg")).toBeNull();
    expect(normalizeTags({})).toBeNull();
    expect(normalizeTags(["ok", 1])).toBeNull();
    expect(normalizeTags(["ok", null])).toBeNull();
  });

  it("逐项 trim、截断到 MAX_TAG_LENGTH、去空", () => {
    expect(normalizeTags([" 风景 ", "", "   "])).toEqual(["风景"]);
    expect(normalizeTags(["x".repeat(MAX_TAG_LENGTH + 10)])).toEqual([
      "x".repeat(MAX_TAG_LENGTH),
    ]);
  });

  it("按原样去重（保留首次出现），不做大小写合并", () => {
    // 大小写合并是 buildImageIndex 的检索口径；入库按原样保留，
    // 否则用户写的 "ACG" 会被悄悄改成 "acg"。
    expect(normalizeTags(["ACG", "acg", "ACG"])).toEqual(["ACG", "acg"]);
  });

  it("数量封顶到 MAX_TAGS_PER_IMAGE", () => {
    const many = Array.from({ length: MAX_TAGS_PER_IMAGE + 5 }, (_, i) => `tag-${i}`);
    const result = normalizeTags(many);
    expect(result).toHaveLength(MAX_TAGS_PER_IMAGE);
    // 保留的是靠前的那些（顺序稳定）
    expect(result?.[0]).toBe("tag-0");
  });

  it("空数组是合法输入（表示清空标签）", () => {
    expect(normalizeTags([])).toEqual([]);
  });
});
