import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 后台「快捷统计」三卡在窄屏被压垮（响应式回归）。
 *
 * 原先这三张卡写死 `grid-cols-3`：任何视口都用三列，而卡片内部
 * 「w-9 图标 + gap-3 + p-3.5*2 + border-2*2」固定吃掉 80px，留给文字的空间
 * 只等于 (视口宽 - 32 - 24)/3 - 80。
 *
 * 用无头 Chrome 在真实构建产物 CSS 下逐档量过（内容取真实量级
 * 「图片总数 1234 / 标签数量 42 / 本页 / 筛选 48 / 1234」）：
 *
 *   视口   每张卡宽   文字可用   最宽内容需要   缺口
 *   320px    88.0px     8.0px       58px       59.0px  ← 文字被裁到只剩 8px
 *   344px    96.0px    16.0px       58px       51.0px
 *   360px   101.3px    21.3px       58px       45.7px
 *   375px   106.3px    26.3px       58px       40.7px
 *   414px   119.3px    39.3px       58px       27.7px
 *   480px   141.3px    61.3px       58px        5.7px  ← 仍裁切
 *   500px   148.0px    68.0px       58px        0      ← 从这里才不裁
 *
 * 也就是 500px 以下（绝大多数手机宽度）三张卡的 label 与数值都在被 ellipsis
 * 静默截断 —— 手机上看后台，统计数字是残缺的。
 *
 * 修法：把固定三列换成按卡片最小宽度自动换行
 * `grid-cols-[repeat(auto-fit,minmax(144px,1fr))]`。144px 保证文字可用宽度
 * （144 - 80 = 64px）≥ 最宽内容需要的 58px；auto-fit 在空间够时才排三列，
 * 否则降到两列/一列。实测同一组数据：320px 一列、340–480px 两列、
 * ≥500px 三列，全程缺口 ≤ 0.3px（浮点取整），再无截断。
 *
 * 用 auto-fit 而不是 auto-fill：只有三项时 auto-fill 会在右侧留一条空轨道，
 * 卡片挤在左侧不平铺；auto-fit 收起空轨道，三项照样撑满整行 —— 所以宽屏
 * （≥500px）的观感与原先的三列完全一致。
 */

const adminPage = readFileSync(
  resolve(process.cwd(), "src/features/admin-page.tsx"),
  "utf8",
);
const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

const MIN_TRACK_PX = 144;
/** 卡片里与文字无关的固定开销 */
const CHROME_PX = 2 * 2 + 3.5 * 4 * 2 + 36 + 12; // border-2*2 + p-3.5*2 + w-9 + gap-3
/** 最宽的一格内容：「本页 / 筛选」+「48 / 1234」 */
const WIDEST_CONTENT_PX = 58;

/** 找出所有 className 串里同时含 gap-3 与 mb-5 的那个（顺序无关） */
function gridClassIn(source: string): string | undefined {
  return [...source.matchAll(/className="([^"]*)"/g)]
    .map((m) => m[1])
    .find((cls) => cls.includes("gap-3") && cls.includes("mb-5"));
}

function tokens(cls: string): string[] {
  return cls.split(/\s+/).filter(Boolean).sort();
}

/** /admin 懒加载骨架里的那张统计网格 */
function fallbackGridClass(source: string): string | undefined {
  const block = source.match(/function AdminFallback\(\)[\s\S]*?\n}/)?.[0] ?? "";
  return [...block.matchAll(/className="([^"]*)"/g)]
    .map((m) => m[1])
    .find((cls) => cls.includes("gap-3") && !cls.includes("aspect-video"));
}

describe("后台快捷统计 · 窄屏三卡不再裁切文字", () => {
  const statsGrid = gridClassIn(adminPage);

  it("统计网格用「卡片最小宽度 + auto-fit」，而不是写死的三列", () => {
    expect(statsGrid, "未能定位后台快捷统计网格").toBeTruthy();
    expect(
      statsGrid,
      "统计网格仍写死 grid-cols-3：500px 以下每张卡只剩 8~61px 放文字，数值会被截断",
    ).not.toMatch(/(^|\s)grid-cols-3(\s|$)/);
    expect(statsGrid, "必须是 grid").toMatch(/(^|\s)grid(\s|$)/);
    expect(statsGrid, "缺少 auto-fit：无法随可用宽度自动降列").toContain("auto-fit");
    expect(statsGrid, "缺少最小轨道宽度").toMatch(/minmax\(\d+px,/);
  });

  it("最小轨道宽度足够容纳「固定开销 + 最宽内容」", () => {
    const min = Number(statsGrid!.match(/minmax\((\d+)px,/)![1]);
    expect(
      min - CHROME_PX,
      `最小轨道 ${min}px 减去 ${CHROME_PX}px 固定开销只剩 ${min - CHROME_PX}px，放不下 ${WIDEST_CONTENT_PX}px 的最宽内容`,
    ).toBeGreaterThanOrEqual(WIDEST_CONTENT_PX);
    // 144px 是实测确认能放下最宽内容的档位，别被调小
    expect(min, "最小轨道被调小到实测安全值以下").toBeGreaterThanOrEqual(MIN_TRACK_PX);
  });

  it("/admin 懒加载骨架用同一张网格，落地时不跳位", () => {
    const fb = fallbackGridClass(appSource);
    expect(fb, "未能定位 /admin 骨架里的统计网格").toBeTruthy();
    expect(
      tokens(fb!),
      "骨架与真实网格的类不一致：窄屏列数对不上，懒加载落地会整块重排",
    ).toEqual(tokens(statsGrid!));
  });
});
