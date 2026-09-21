import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 更新日志时间轴必须是一条连续的线。
 *
 * 原先的写法：每条记录各自在自己的圆点列里画一段 `flex-1` 的虚线。
 * 问题在于每条之间还隔着 `space-y-5`(20px) + 圆点 `mt-2`(8px) = 28px，
 * 那 28px 不属于任何一条的列，也就没有任何线去覆盖它。
 *
 * 无头实测（修复前）：
 *   seg0->1: sepBottom=4216 nextDotTop=4244 GAP=28
 *   seg1->2: sepBottom=4421 nextDotTop=4449 GAP=28
 * 整条时间轴在每条之间断 28px，看起来是碎的。
 *
 * 修法：竖线提到外层容器，用绝对定位从 top-2 铺到 bottom-2（一条），
 * 圆点列只留圆点。实测（修复后）：单条线 h=523、覆盖首个圆点、到达末个圆点、
 * 与圆点中心 x 偏移 0px。
 *
 * 这里按源码钉住「只有一条外层竖线」这个形状，避免以后有人又改回逐条画线。
 */

const src = readFileSync(
  resolve(process.cwd(), "src/components/sections/Changelog.tsx"),
  "utf8",
);

/** 取出竖线那个元素的完整标签（从它前面的 <div 到闭合的 />） */
function lineElement(): string {
  const marker = src.indexOf("border-l-2 border-dashed");
  if (marker < 0) return "";
  const open = src.lastIndexOf("<div", marker);
  const close = src.indexOf("/>", marker);
  return open >= 0 && close > open ? src.slice(open, close + 2) : "";
}

describe("更新日志 · 时间轴连续性", () => {
  it("竖线只有一条（逐条渲染会重新产生 28px 断口）", () => {
    const lines = src.match(/border-l-2 border-dashed/g) ?? [];
    expect(lines.length).toBe(1);
  });

  it("竖线绝对定位并从 top-2 铺到 bottom-2，盖住条间空隙", () => {
    const el = lineElement();
    expect(el, "未能定位竖线元素").not.toBe("");
    expect(el, "竖线必须是绝对定位").toContain("absolute");
    expect(el, "缺少 top-2").toContain("top-2");
    expect(el, "缺少 bottom-2").toContain("bottom-2");
  });

  it("时间轴容器带 relative，绝对定位的竖线才有正确参照", () => {
    expect(src, "外层容器缺少 relative").toMatch(/className="relative max-w-3xl mx-auto"/);
  });

  it("竖线对读屏与指针透明（纯装饰）", () => {
    const el = lineElement();
    expect(el).toContain('aria-hidden="true"');
    expect(el).toContain("pointer-events-none");
  });
});
