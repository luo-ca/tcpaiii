import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 图库两个「N 张」不得用同一个「共」字打架（P178）。
 *
 * 页面上有两处数量陈述：
 *   · 头部「共 N 张（当前筛选结果）」—— 用服务端 total，讲的是**库里有多少**
 *   · 页脚「到底提示」            —— 用 images.length，讲的是**本次渲染了多少**
 *
 * P171 引入按 id 去重后，两者可以合法地不相等。而页脚原先也写「共 N 张」，
 * 于是同屏出现「共 24 张」与「共 21 张」—— 两个「共」字读起来像同一件事的
 * 两种说法，用户只能判断成页面出错（P173 修的是同一类矛盾，那次是「取错页的 total」）。
 *
 * 实测（桩：两页共 24 张、第 2 页与第 1 页重叠 3 张）：
 *   修复前 → 头部「共 24 张」+ 页脚「已经到底了 · 共 21 张」
 *   修复后 → 头部「共 24 张」+ 页脚「已经到底了 · 已加载 21 张」
 *
 * 正常场景（无重叠、ok 桩 48 张）读起来也通顺：头部「共 48 张」、页脚「已加载 48 张」。
 */

const SOURCE = readFileSync(resolve(process.cwd(), "src/features/gallery-browse.tsx"), "utf8");

describe("图库 · 两处数量陈述的措辞不得互相矛盾", () => {
  it("页脚到底提示用「已加载」而不是「共」", () => {
    expect(
      SOURCE,
      "页脚又写回「共 N 张」了 —— 它讲的是渲染进度，与头部「共 N 张」（库存）用同一个字会打架",
    ).toContain("已经到底了 · 已加载");
    expect(
      SOURCE,
      "页脚仍在用「共 {images.length} 张」这种写法",
    ).not.toMatch(/已经到底了 · 共 \{images\.length\} 张/);
  });

  it("头部「共 N 张」仍取服务端 total（这是唯一的库存权威）", () => {
    const i = SOURCE.indexOf("const total =");
    expect(i, "找不到 total 声明").toBeGreaterThan(-1);
    const decl = SOURCE.slice(i, i + 200);
    expect(
      decl,
      "头部数量不再取服务端 total —— 库存数字失去权威来源",
    ).toMatch(/pages\[/);
    expect(decl, "取 total 时未用最后一页（P173 的修复点）").toMatch(/pages\.length - 1/);
  });

  it("读屏 live region 用「已加载 / 已全部加载」，与页脚措辞一致", () => {
    const i = SOURCE.indexOf('role="status" aria-live="polite"');
    expect(i, "找不到 live region").toBeGreaterThan(-1);
    const block = SOURCE.slice(i, i + 400);
    expect(block, "live region 未使用「已加载」措辞").toMatch(/已加载 \$\{images\.length\}/);
  });
});
