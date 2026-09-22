import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 图库搜索框要有「只清搜索词」的按钮。
 *
 * 原先想清掉搜索词只有两条路：
 *   1. 手动按住退格删干净；
 *   2. 点「清空筛选」—— 但它同时清掉标签（clearFilters 里
 *      setSelectedTag(null) + setSearchTerm('')）。
 * 于是「先选了 tag=acg，再搜个词，发现搜错了想重搜」的用户，
 * 必须连标签一起放弃。这是图库最常用的控件上的一处多余摩擦。
 *
 * 修法：输入框右侧加一个 X 按钮，只 setSearchTerm('')，不动标签；
 * 并让输入框在有词时补 pr-9，避免长词压到按钮上。
 */

const src = readFileSync(
  resolve(process.cwd(), "src/features/gallery-browse.tsx"),
  "utf8",
);

describe("图库搜索 · 只清搜索词的按钮", () => {
  it("按钮只清搜索词，不动标签", () => {
    const i = src.indexOf('aria-label="清除搜索词"');
    expect(i, "缺少清除搜索词按钮").toBeGreaterThan(0);
    // setSearchTerm 在该属性之前，窗口要往前留
    const around = src.slice(Math.max(0, i - 420), i + 260);
    expect(around, "应清搜索词").toContain("setSearchTerm('')");
    expect(around, "不应顺手清掉标签").not.toContain("setSelectedTag");
  });

  it("仅在搜索词非空时渲染", () => {
    expect(src).toMatch(/\{searchTerm && \(/);
  });

  it("是可聚焦的 button 且带无障碍名", () => {
    const i = src.indexOf('aria-label="清除搜索词"');
    const around = src.slice(Math.max(0, i - 420), i + 420);
    expect(around).toContain('type="button"');
    expect(around).toContain("aria-label=");
    expect(around, "图标应 aria-hidden，名字由 aria-label 提供").toContain('aria-hidden="true"');
  });

  it("有词时输入框留出右内边距", () => {
    expect(src, "缺 pr-9，长搜索词会压到按钮上").toMatch(/searchTerm \? 'pr-9' : ''/);
  });

  it("「清空筛选」仍然是同时清两者（行为没被改坏）", () => {
    const i = src.indexOf("const clearFilters");
    const block = src.slice(i, i + 160);
    expect(block).toContain("setSelectedTag(null)");
    expect(block).toContain("setSearchTerm('')");
  });
});
