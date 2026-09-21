import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const headerSource = readFileSync(
  resolve(process.cwd(), "src/components/layout/Header.tsx"),
  "utf8",
);
const cssSource = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

/**
 * 顶栏高度契约。
 *
 * 顶栏是 `fixed` 的，页面靠 `--header-h` 这个 token 给自己留出顶部空间。
 * 于是 token 必须**恒等于顶栏的实际渲染高度**，否则首屏内容会被遮住。
 *
 * 顶栏有两种形态：
 *   · 窄屏：顶部行 + 一条独立的移动导航行（两行）
 *   · 宽屏：只剩顶部行（一行）
 *
 * 这里曾经出过一个 bug：顶部行用 `sm:h-16`（640px 长高），
 * 而移动导航行用 `md:hidden`（768px 才消失）—— 中间 640–767px
 * 两行同时存在，实际高度 64+40=104px，token 却只给了 96px，遮住 8px。
 *
 * 契约：**顶部行开始变高的断点，必须不早于移动导航行消失的断点。**
 */
describe("顶栏高度契约", () => {
  it("--header-h token 为 64px，且移动端覆盖为 96px", () => {
    expect(cssSource).toMatch(/--header-h:\s*64px/);
    expect(cssSource).toMatch(/--header-h:\s*96px/);
  });

  it("顶部行的高度断点不早于移动导航行的隐藏断点", () => {
    // 顶部行：含 h-14 / h-16 的那个 class 串
    const topRow = headerSource.match(/className="([^"]*\bh-14\b[^"]*)"/)?.[1];
    expect(topRow, "未能定位顶栏顶部行的高度类").toBeTruthy();

    // 移动导航行：含 md:hidden 的那个 class 串
    const mobileNav = headerSource.match(/className="([^"]*\bmd:hidden\b[^"]*)"/)?.[1];
    expect(mobileNav, "未能定位移动导航行").toBeTruthy();

    // 断点优先级：无前缀 < sm(640) < md(768) < lg(1024)
    const rank: Record<string, number> = { "": 0, sm: 1, md: 2, lg: 3 };
    const breakpointOf = (classes: string, base: string) => {
      const hit = classes.split(/\s+/).find((c) => new RegExp(`^([a-z]+):${base}$`).test(c));
      return hit ? hit.split(":")[0] : "";
    };

    const growAt = breakpointOf(topRow!, "h-16");
    const navHiddenAt = breakpointOf(mobileNav!, "hidden");

    // 顶部行长高的那档，至少要等到移动导航已经不显示
    expect(
      rank[growAt] ?? -1,
      `顶部行在 ${growAt || "(无断点)"} 长高，但移动导航要到 ${navHiddenAt || "(无断点)"} 才隐藏 —— 两者之间会多出一个 40px 的导航行，--header-h 少算`,
    ).toBeGreaterThanOrEqual(rank[navHiddenAt] ?? -1);
  });

  /**
   * 第二个、更隐蔽的同类 bug：顶栏**没写高度**时，元素盒由内容撑开，
   * 而底部的阅读进度线是 `absolute bottom-0 h-0.5`（2px）—— 它会从内容盒
   * （64px）下面再撑出 1px，顶栏实际渲染 65px，token 却是 64px。
   *
   * 这类偏差不靠类名能看出来（类名全都「对」），只有真去量盒子高度才暴露。
   * 修法是把顶栏显式锁到 `h-[var(--header-h)]`，让进度线叠在顶栏内部。
   */
  it("顶栏显式锁定 h-[var(--header-h)]，进度线不再撑高盒子", () => {
    const headerTag = headerSource.match(/<header[\s\S]*?className=\{`([^`]*)`/);
    expect(headerTag, "未能定位 <header> 的 className").toBeTruthy();
    expect(
      headerTag![1],
      "顶栏缺少 h-[var(--header-h)]：底部的 2px 进度线会把顶栏撑出 1px，与 token 差 1px",
    ).toContain("h-[var(--header-h)]");

    // 进度线必须仍是绝对定位（锁高后才不会参与撑高）
    const bar = headerSource.match(/className="([^"]*bottom-0[^"]*h-0\.5[^"]*)"/)?.[1];
    expect(bar, "未能定位阅读进度线").toBeTruthy();
    expect(bar!).toContain("absolute");
  });
});
