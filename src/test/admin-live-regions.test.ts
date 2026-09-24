import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 后台的动态变化必须能被读屏感知（P113）。
 *
 * 公库页（gallery-browse）在「加载更多」旁挂了常驻 live region，
 * 明确写着「读屏用户点完按钮，DOM 只是多了几张瓦片，没有任何提示」。
 * 后台页却一处都没有：翻页、改筛选、刷新图库后，DOM 变了但没有任何播报，
 * 读屏用户无从知道「现在是第几页、共几张、是不是还在刷新」。
 *
 * 修法：给两处动态区域补 live region ——
 *   · 「正在刷新图库数据」→ role="status" aria-live="polite"
 *   · 分页统计条（共 N 张 / 第 X / Y 页）→ 同上，翻页后读屏会播报新页码
 */

const src = readFileSync(
  resolve(process.cwd(), "src/features/admin-page.tsx"),
  "utf8",
);

describe("后台 · 动态变化有读屏播报", () => {
  it("后台页不再是「零 live region」", () => {
    expect(src, "admin 页没有任何 aria-live：翻页/刷新对读屏完全静默").toMatch(/aria-live/);
  });

  it("「正在刷新图库数据」是 polite 状态区", () => {
    const i = src.indexOf("正在刷新图库数据");
    expect(i, "未能定位刷新提示").toBeGreaterThan(-1);
    const around = src.slice(Math.max(0, i - 420), i + 40);
    expect(around, "刷新提示缺 role=status").toContain('role="status"');
    expect(around, "刷新提示缺 aria-live").toContain('aria-live="polite"');
  });

  it("分页统计条（共 N 张 / 第 X / Y 页）是 polite 状态区", () => {
    const i = src.indexOf("第 {page} / {totalPages} 页");
    expect(i, "未能定位分页统计").toBeGreaterThan(-1);
    const around = src.slice(Math.max(0, i - 900), i + 40);
    expect(around, "分页统计缺 role=status").toContain('role="status"');
    expect(around, "分页统计缺 aria-live").toContain('aria-live="polite"');
  });
});
