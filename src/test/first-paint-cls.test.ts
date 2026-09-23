import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 首屏 CLS 的三处回归守卫。
 *
 * 用 PerformanceObserver 在真实构建产物上逐条读 layout-shift 实测到三处问题：
 *
 *  1) 首页 Hero 的统计行原先写作 `{hasStatData && ...}`，stats 一到才挂载，
 *     左栏高度从 421px 突增到 535px（+114px），把「在线预览」及以下整段推下去。
 *     位移节点报的就是 `.text-center.lg:text-left`。首页首屏 CLS = 0.0446。
 *
 *  2) /status 与 /docs 原先共用通用的 SectionFallback（4 张卡网格，约 256px），
 *     与真实内容形状差得远：
 *       /status 真实 778px（页头 + 横幅 + 2×2 卡）→ 落地时页脚 272px 跳到 794px，CLS 0.1657
 *       /docs   真实 1206px（页头 + 分段长内容）→ 页脚下移 500px 以上，CLS 0.0801
 *     0.1657 已经越过 Core Web Vitals 的 good 阈值 0.10。
 *
 * 修法与实测结果：
 *   · Hero 统计行改为「加载中渲染同构骨架」（chip 数量/图标/文案/内边距一致，
 *   · 首页「实时统计」原先也挂 SectionFallback（256px vs 真实 907~977px），
 *     落地时页脚下移 824px —— 改为按「页头 + 卡片网格 + 趋势图」铺骨架
 *     只有数值位是骨架块）→ 首页 CLS 0.0446 → 0.0005
 *   · /status、/docs 各配一个形状匹配的专用骨架 → 0.1657 → 0.009、0.0801 → 0
 */

const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const hero = readFileSync(
  resolve(process.cwd(), "src/components/sections/HeroSection.tsx"),
  "utf8",
);

describe("首屏 CLS · Hero 统计行加载中占位", () => {
  it("统计行由 isPending 参与渲染，而不是等数据到位才挂载", () => {
    expect(hero, "未取 isPending：无从判断是否还在加载").toMatch(/isPending:\s*statsPending/);
    expect(
      hero,
      "统计行没有在加载中渲染：会重演「数据到达 → 左栏长高 114px」的位移",
    ).toMatch(/showStatRow\s*=\s*statsPending\s*\|\|\s*hasStatData/);
  });

  it("加载态渲染骨架块，且 chip 结构（图标 + 文案）保持一致", () => {
    expect(hero, "缺少加载骨架块").toMatch(/skeleton-shimmer inline-block/);
    // 骨架必须仍在 chip 内（chip 高度由 px/py 与图标决定，两态一致）
    const i = hero.indexOf("statBadges.map");
    const block = hero.slice(i, i + 1800);
    expect(block, "骨架不在 chip 内：加载态与完成态的行高会不一致").toContain("skeleton-shimmer");
    expect(block, "chip 内应保留 label，两态宽度才稳定").toContain("item.label");
  });

  it("数值位在加载态不渲染具体数字（避免闪现 0）", () => {
    const i = hero.indexOf("statBadges.map");
    const block = hero.slice(i, i + 1800);
    expect(block, "加载态与完成态应由 hasStatData 区分").toMatch(/hasStatData\s*\?/);
  });
});

describe("首屏 CLS · 懒加载骨架与真实形状匹配", () => {
  it("所有懒加载区块都用形状匹配的专用骨架，不再有通用 SectionFallback", () => {
    expect(app, "缺少 StatusFallback").toContain("function StatusFallback()");
    expect(app, "缺少 DocsFallback").toContain("function DocsFallback()");
    // StatusPage / ApiDocsSection / SecurityFeatures 三处都不再挂 SectionFallback
    const suspenses = [...app.matchAll(/<Suspense fallback=\{<(\w+) \/>\}>/g)].map((m) => m[1]);
    const sectionFallbackCount = suspenses.filter((n) => n === "SectionFallback").length;
    expect(
      sectionFallbackCount,
      "仍有懒加载区块挂 SectionFallback：Shape 不匹配会让页脚在落地时跳位",
    ).toBe(0);
  });

  it("StatusFallback 近似真实结构：固定页头 + 横幅 + 三卡（末卡跨列 + sm 拉伸）", () => {
    const i = app.indexOf("function StatusFallback()");
    expect(i, "缺少 StatusFallback").toBeGreaterThan(-1);
    const block = app.slice(i, app.indexOf("function DocsFallback()"));
    // 页头必须是「固定高度块」而不是三行细骨架：实测三行只有 76px，
    // 比真实页头（125/113px）矮 37~49px，落地时会「长高」。
    expect(block, "页头未用固定高度对齐真实高度").toMatch(/h-\[125px\].*sm:h-\[113px\]/);
    expect(block, "缺横幅骨架").toMatch(/h-\[123px\].*sm:h-\[79px\]/);
    expect(block, "缺 2 列卡片网格").toContain("sm:grid-cols-2");
    expect(block, "缺末张跨列卡").toContain("sm:col-span-2");
    // ≥sm 两列时 grid 会把同行两卡拉等高，骨架固定高度需显式抵消
    expect(
      block,
      "第二卡未写 sm:h-[166px]：≥sm 会被真实态的 grid 拉伸拉高，产生位移",
    ).toMatch(/h-\[132px\].*sm:h-\[166px\]/);
  });

  it("DocsFallback 近似真实结构：页头 + 多个分段块", () => {
    const i = app.indexOf("function DocsFallback()");
    const block = app.slice(i, i + 1200);
    expect(block, "缺页头骨架").toMatch(/h-3 w-20/);
    const chunks = [...block.matchAll(/h-\[\d+px\] rounded-2xl skeleton-shimmer/g)].length;
    expect(chunks, "分段块太少：与真实长内容差得远，仍会有明显位移").toBeGreaterThanOrEqual(3);
  });

  it("RealtimeStatsFallback 按「页头 + 卡片网格 + 趋势图」近似真实结构", () => {
    const i = app.indexOf("function RealtimeStatsFallback()");
    expect(i, "缺少 RealtimeStatsFallback").toBeGreaterThan(-1);
    const block = app.slice(i, i + 1000);
    expect(block, "缺 2 列卡片网格").toContain("grid-cols-2");
    expect(block, "缺 4 列断点").toContain("lg:grid-cols-4");
    expect(block, "缺趋势图骨架（真实区块里最高的那块）").toMatch(/h-\[\d{3}px\] rounded-2xl skeleton-shimmer/);
  });
});
