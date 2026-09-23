import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 图片浮层白字的遮罩深度必须够（P98）。
 *
 * 图库里的图是外链、颜色完全不可控，最坏情况是接近纯白的插画/壁纸 ——
 * 这是线上真实存在的（大量浅色壁纸）。白字压在底部渐隐上，对比度只由
 * 遮罩的黑色 alpha 决定：alpha 越浅，浅色图上的白字越糊。
 *
 * 用「纯白图 + 真实构建产物 CSS」跑进无头 Chrome 截图，再逐像素解码
 * PNG、取文字带内的众数底色，实测出各档 alpha 的最坏对比度：
 *
 *   遮罩档位        文字带底色        白字对比度   是否达 AA(4.5)
 *   from-black/55   rgb(138,138,138)   3.45:1      ✗
 *   from-black/70   rgb(109,109,109)   5.17:1      ✓
 *   from-black/80   rgb(87,87,87)      7.23:1      ✓
 *
 * 站点原先不统一：masonry-tile 与 image-card 都是 /70，
 * OnlinePreview 是 /80，唯独首页主视觉这条是 /55 —— 同一类「图上的白字」
 * 三种深度，而最浅的那条恰好用在首页最大的一张图上（最显眼、最容易被看到糊字）。
 *
 * 修法：统一到 /70（与瓦片一致，最坏 5.17:1 达标）。这里在源码钉住下限，
 * 防止以后为了「让图更透出来」又调浅。
 */

const hero = readFileSync(
  resolve(process.cwd(), "src/components/sections/HeroSection.tsx"),
  "utf8",
);
const tile = readFileSync(
  resolve(process.cwd(), "src/components/ui/masonry-tile.tsx"),
  "utf8",
);
const card = readFileSync(
  resolve(process.cwd(), "src/features/admin/image-card.tsx"),
  "utf8",
);

/** 从 class 串里取 bg-gradient 的 from-black/<n> 档位 */
function blackAlphaOf(source: string, label: string): number {
  const m = source.match(/from-black\/(\d+)/g);
  expect(m && m.length, `未能定位 ${label} 的 from-black 遮罩`).toBeGreaterThan(0);
  return Math.max(...m!.map((s) => Number(s.replace("from-black/", ""))));
}

describe("图片上的白字 · 遮罩深度不低于 AA 实测安全值", () => {
  it("首页主视觉遮罩 ≥ /70（实测 /55 只有 3.45:1，/70 是 5.17:1）", () => {
    const alpha = blackAlphaOf(hero, "首页主视觉");
    expect(
      alpha,
      `首页主视觉遮罩只有 /${alpha}：浅色图上的白字对比度会低于 WCAG AA 4.5:1`,
    ).toBeGreaterThanOrEqual(70);
  });

  it("公开图库瓦片保持 ≥ /70（同一问题的另一处，别在改动里调浅）", () => {
    expect(blackAlphaOf(tile, "图库瓦片")).toBeGreaterThanOrEqual(70);
  });

  it("后台卡片保持 ≥ /70", () => {
    expect(blackAlphaOf(card, "后台卡片")).toBeGreaterThanOrEqual(70);
  });

  it("首页的遮罩类不再有任何 /55 档（注释里提到历史值不算）", () => {
    // 只看 className 里的真实用法：注释里说明「原先用 /55」是允许的
    const classNames = [...hero.matchAll(/className="([^"]*)"/g)].map((m) => m[1]).join(" ");
    expect(
      classNames,
      "首页又有 class 用回 from-black/55：实测白字对比度只有 3.45:1，低于 AA",
    ).not.toContain("from-black/55");
  });
});
