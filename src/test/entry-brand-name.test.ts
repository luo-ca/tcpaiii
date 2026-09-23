import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 入口层的品牌名必须与全站一致。
 *
 * index.html 的加载骨架和 main.tsx 的崩溃兜底，是用户**最先**（页面还在加载）
 * 与**最后**（脚本崩了）看到的两屏。它们用了内联样式、自成一体，
 * 因此长期游离在品牌常量之外 —— 全站 32 处都写「派次元 API」，
 * 只有这两处写罗马字 "PaiCiYuan API"。
 *
 * 用户视角：地址栏/标题是「派次元 API」、加载页却是「PaiCiYuan API」、
 * 崩溃页还是「PaiCiYuan API」——同一站点两个名字。
 *
 * 这类问题不会有任何测试失败：内联 HTML 里的文案没人断言。
 */

const indexHtml = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const mainSource = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");

describe("入口层品牌名一致", () => {
  it("加载骨架不再使用罗马字别名", () => {
    expect(indexHtml, "index.html 骨架又出现罗马字品牌名了").not.toMatch(/PaiCiYuan/i);
  });

  it("崩溃兜底不再使用罗马字别名", () => {
    expect(mainSource, "main.tsx 兜底又出现罗马字品牌名了").not.toMatch(/PaiCiYuan/i);
  });

  it("两处都使用与全站一致的「派次元 API」", () => {
    // 骨架：品牌行 + 与 <title> 同源
    expect(indexHtml).toContain("派次元 API");
    expect(mainSource).toContain("派次元 API");
  });

  it("index.html 的 <title> 与骨架同属一个品牌名", () => {
    const title = indexHtml.match(/<title>([^<]+)</)?.[1] ?? "";
    expect(title).toContain("派次元 API");
  });
});
