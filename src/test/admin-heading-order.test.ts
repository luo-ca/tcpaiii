import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 后台卡片的标题层级注释必须与真实 DOM 顺序一致。
 *
 * image-card.tsx 里有一段解释「为什么用 h3 而不是 h4」的注释，原先写的理由是：
 *   「这个标题在文档里早于页面的 h1「图片管理」出现（页头在卡片网格之后才渲染），
 *     用 h4 会让读屏出现 h4 → h1 的乱序」
 *
 * 但页头早已移到网格之前 —— 实测 admin-page.tsx 中 <h1> 在 ~345 行、
 * <ImageCard> 在 ~632 行，是 h1 先、h3 后。注释自 P50 拆分以来没再更新，
 * 期间 admin-page 经历了 P55/P78/P82 多次改动。
 *
 * 结论（用 h3）本身没问题，但**理由是错的**：会误导维护者以为可以随意改成 h4
 * 而只是「顺序问题」。这条测试钉住「注释描述的顺序与源码实际顺序一致」。
 */

const adminPage = readFileSync(
  resolve(process.cwd(), "src/features/admin-page.tsx"),
  "utf8",
).split("\n");

const imageCard = readFileSync(
  resolve(process.cwd(), "src/features/admin/image-card.tsx"),
  "utf8",
);

function indexOfLine(lines: string[], re: RegExp, from = 0): number {
  for (let i = from; i < lines.length; i += 1) {
    if (re.test(lines[i])) return i;
  }
  return -1;
}

describe("后台卡片 · 标题层级注释与实际一致", () => {
  const h1At = indexOfLine(adminPage, /<h1/);
  // 只看 JSX 渲染，不匹配 import
  const gridAt = indexOfLine(adminPage, /<ImageCard/);

  it("页头 h1 确实渲染在卡片网格之前", () => {
    expect(h1At, "找不到页头 h1").toBeGreaterThan(-1);
    expect(gridAt, "找不到 <ImageCard> 渲染点").toBeGreaterThan(-1);
    expect(
      h1At,
      "页头 h1 应在网格之前（当前注释正是基于这一点写的）",
    ).toBeLessThan(gridAt);
  });

  it("注释不再声称「页头在网格之后渲染」", () => {
    expect(
      imageCard,
      "注释又写成「页头在网格之后」了 —— 与源码顺序矛盾",
    ).not.toMatch(/页头在卡片网格之后/);
  });

  it("注释说明了 h1 先于卡片这一事实", () => {
    expect(imageCard, "注释未反映真实的 DOM 顺序").toMatch(/h1 在 ~?\d+ 行|<ImageCard> 在 ~?\d+ 行|页头已.*移到网格之前/);
  });
});
