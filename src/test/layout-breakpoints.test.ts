import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 主布局的响应式断点契约（P158）。
 *
 * 背景：响应式此前只有 2 个具体组件的测试（admin 快捷统计、status 横幅），
 * 而**主页面骨架的断点没有任何护栏** —— 改坏了不会报错，只会在某个宽度区间
 * 悄悄变形，而没人会在每个宽度都肉眼过一遍。
 *
 * 本文件用无头 Chrome 在真实构建产物上逐档量过一遍（结果贴在每条断言里），
 * 然后把契约钉在源码的 className 上（与 status-banner-responsive 同范式）：
 *
 *   视口    瀑布流列数   桌面导航   移动导航
 *   360px      2         none       flex
 *   700px      3         none       flex
 *   900px      3         flex       none
 *   1300px     4         flex       none
 *
 * 关键点：导航切换的断点是 **md(768)**，必须与 Header 的高度断点
 * （h-14 md:h-16）以及 --header-h 的 767/768 分界保持一致 ——
 * 三者错位会出现「导航换了但高度没换」的 8px 遮挡（Header 注释里记录过）。
 */

const GALLERY = readFileSync(resolve(process.cwd(), "src/features/gallery-browse.tsx"), "utf8");
const HEADER = readFileSync(resolve(process.cwd(), "src/components/layout/Header.tsx"), "utf8");
const HERO = readFileSync(resolve(process.cwd(), "src/components/sections/HeroSection.tsx"), "utf8");
const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

/** 从源码里取某个片段（避免整份源码里搜到别处的同名类） */
function slice(src: string, from: string, len = 600): string {
  const i = src.indexOf(from);
  expect(i, `找不到锚点：${from}`).toBeGreaterThan(-1);
  return src.slice(i, i + len);
}

describe("图库瀑布流 · 列数断点（P158）", () => {
  it("2 列起步 → sm 3 列 → lg 4 列", () => {
    const block = slice(GALLERY, "columns-2 gap-3 transition-opacity", 240);
    expect(block, "窄屏应 2 列").toMatch(/(^|`|\s)columns-2(\s|`)/);
    expect(block, "≥sm 应 3 列").toContain("sm:columns-3");
    expect(block, "≥lg 应 4 列").toContain("lg:columns-4");
  });

  it("列间距随列数一起放大（gap-3 → sm:gap-4）", () => {
    const block = slice(GALLERY, "columns-2 gap-3 transition-opacity", 240);
    expect(block).toMatch(/gap-3/);
    expect(block).toMatch(/sm:gap-4/);
  });
});

describe("顶栏导航 · 移动/桌面切换（P158）", () => {
  it("桌面导航 hidden md:flex（768px 起显示）", () => {
    const block = slice(HEADER, "hidden md:flex items-center", 200);
    expect(block, "桌面导航缺 md: 断点").toMatch(/hidden md:flex/);
  });

  it("移动导航 grid ... md:hidden（768px 起隐藏）", () => {
    const block = slice(HEADER, "grid grid-cols-4", 200);
    expect(block, "移动导航缺 md:hidden").toContain("md:hidden");
  });

  it("导航切换断点与顶栏高度断点一致（都是 md，避免 8px 遮挡）", () => {
    // Header 注释记录过：若高度写成 sm:h-16，640–767px 会出现
    //「顶栏实际 104px 但 --header-h 按 96px 算」→ 内容被遮 8px
    expect(HEADER, "顶栏高度断点与导航不一致").toMatch(/h-14 md:h-16/);
  });

  it("--header-h 的移动分界与 md(768) 对齐", () => {
    // 移动端 96px、桌面 64px，分界必须是 767px（即 md 之前）
    const i = CSS.indexOf("--header-h");
    expect(i).toBeGreaterThan(-1);
    expect(CSS, "--header-h 的移动分界必须是 max-width: 767px").toMatch(
      /@media \(max-width:\s*767px\)[\s\S]{0,200}--header-h:\s*96px/,
    );
    expect(CSS, "桌面档 --header-h 应为 64px").toMatch(/--header-h:\s*64px/);
  });

  it("移动导航列数与页签数量一致（多一个页签会折行破坏高度契约）", () => {
    const tabsSrc = readFileSync(resolve(process.cwd(), "src/lib/constants.ts"), "utf8");
    const tabCount = (tabsSrc.match(/\{\s*path:\s*'[^']+'/g) || []).length;
    const gridCols = HEADER.match(/grid grid-cols-(\d+)/);
    expect(gridCols, "移动导航缺 grid-cols-N").not.toBeNull();
    expect(
      Number(gridCols![1]),
      `页签 ${tabCount} 个但移动导航是 ${gridCols![1]} 列 —— 折行会让顶栏高度超出 --header-h`,
    ).toBe(tabCount);
  });
});

describe("Hero · 双栏断点（P158）", () => {
  it("只在 lg 起分两栏（窄屏必须单栏堆叠）", () => {
    expect(HERO, "Hero 缺 lg:grid-cols 双栏").toMatch(/lg:grid-cols-\[[^\]]+\]/);
    // 断点必须是 lg 前缀，不能降级成 sm/md（那会把窄屏挤成两栏）
    const grid = HERO.match(/grid[^"]*lg:grid-cols-\[[^\]]+\]/);
    expect(grid, "找不到 Hero 栅格类名").not.toBeNull();
    expect(grid![0], "Hero 栅格不应在 lg 之前就分栏").not.toMatch(/\b(sm|md):grid-cols/);
  });
});