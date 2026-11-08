import { describe, expect, it } from "vitest";
import { clampNumber, getVisiblePages } from "@/lib/helpers";

/**
 * 分页控件的两个纯函数（admin 后台）。
 *
 * getVisiblePages 决定「第 1 ··· 4 5 6 ··· 20」这一排按钮的内容，
 * clampNumber 决定跳页输入越界后落在哪一页。两者都在渲染路径上，
 * 出错不会抛异常：会渲染出空页码条，或者把用户送到一个不存在的页。
 */

describe("clampNumber", () => {
  it("区间内原样返回", () => {
    expect(clampNumber(5, 1, 10)).toBe(5);
    expect(clampNumber(1, 1, 10)).toBe(1);
    expect(clampNumber(10, 1, 10)).toBe(10);
  });

  it("越界时夹到最近的一端", () => {
    expect(clampNumber(0, 1, 10)).toBe(1);
    expect(clampNumber(-99, 1, 10)).toBe(1);
    expect(clampNumber(11, 1, 10)).toBe(10);
    expect(clampNumber(999, 1, 10)).toBe(10);
  });

  it("min 大于 max 时落在 max 上（越界输入不产出区间外的页）", () => {
    expect(clampNumber(5, 10, 1)).toBe(1);
  });
});

describe("getVisiblePages", () => {
  it("总页数不超过 7 时全部列出", () => {
    expect(getVisiblePages(1, 1)).toEqual([1]);
    expect(getVisiblePages(2, 3)).toEqual([1, 2, 3]);
    expect(getVisiblePages(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("0 页时给空数组（不产出 [1] 这种不存在的页）", () => {
    expect(getVisiblePages(1, 0)).toEqual([]);
  });

  it("首页只向右展开：1 2 3 4 ··· N", () => {
    expect(getVisiblePages(1, 8)).toEqual([1, 2, 3, 4, 8]);
    expect(getVisiblePages(2, 20)).toEqual([1, 2, 3, 4, 20]);
  });

  it("末页只向左展开：1 ··· N-3 N-2 N-1 N", () => {
    expect(getVisiblePages(8, 8)).toEqual([1, 5, 6, 7, 8]);
    expect(getVisiblePages(20, 20)).toEqual([1, 17, 18, 19, 20]);
  });

  it("中间页围绕当前页展开：1 ··· c-1 c c+1 ··· N", () => {
    expect(getVisiblePages(4, 8)).toEqual([1, 3, 4, 5, 8]);
    expect(getVisiblePages(10, 20)).toEqual([1, 9, 10, 11, 20]);
  });

  it("恒为升序去重，且首尾页始终在列", () => {
    for (const [current, total] of [
      [1, 8],
      [3, 8],
      [7, 8],
      [8, 8],
      [1, 100],
      [50, 100],
      [100, 100],
    ] as const) {
      const pages = getVisiblePages(current, total);
      expect(pages, `${current}/${total} 未升序`).toEqual([...pages].sort((a, b) => a - b));
      expect(new Set(pages).size, `${current}/${total} 有重复页码`).toBe(pages.length);
      expect(pages, `${current}/${total} 缺首页`).toContain(1);
      expect(pages, `${current}/${total} 缺末页`).toContain(total);
      // 页码必须都落在 [1, total]，否则按钮点下去会请求不存在的页
      for (const page of pages) {
        expect(page).toBeGreaterThanOrEqual(1);
        expect(page).toBeLessThanOrEqual(total);
      }
    }
  });

  it("当前页在合法区间内时一定出现在结果里", () => {
    for (let current = 1; current <= 20; current++) {
      expect(getVisiblePages(current, 20), `当前页 ${current} 不在页码条里`).toContain(current);
    }
  });

  it("越界的当前页被夹进 [3, total-2]，不产生越界页码", () => {
    expect(getVisiblePages(0, 10)).toEqual([1, 2, 3, 4, 10]);
    expect(getVisiblePages(99, 10)).toEqual([1, 7, 8, 9, 10]);
  });
});
