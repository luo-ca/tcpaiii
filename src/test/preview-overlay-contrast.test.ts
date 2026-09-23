import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 首页在线预览卡：图上的白字必须落在恒定深色底上（P99）。
 *
 * 这里原先是一条 `from-black/80 via-black/45 to-transparent` 的渐变，
 * 但渐变是画在**内容盒自身**上的，而标题又锚在内容盒的**顶部** ——
 * 于是标题背景只取到渐变最透明的那一段：
 *
 *   (纯白图 + 真实构建产物，无头 Chrome 截图后逐像素解码)
 *   视口     标题在渐变内的相对位置   实际底色         白字对比度
 *   390px    0.22                    20% 黑 ≈ 206 灰   1.57:1   ✗
 *   1200px   0.33                    29% 黑 ≈ 179 灰   1.95:1   ✗
 *
 * WCAG AA 对 16px 正文要求 4.5:1。更难办的是：单张图最多挂 20 个标签，
 * 标签换行会把内容盒撑高、标题进一步往透明端走 —— 「渐变」方案对内容高度
 * 天然脆弱，图越"热闹"字越看不清。
 *
 * 修法：内容盒自身带 70% 深色底（与 masonry-tile / image-card 同档），
 * 用 before: 伪元素在盒子上方补一条 16 高的柔化渐变消除硬边。
 * 实测修后 390px 与 1200px 的底色都恒为 rgb(76,76,76)（= 白图 × 70% 黑），
 * 对比度 8.59:1，且不再随标签多少变化。
 */

const src = readFileSync(
  resolve(process.cwd(), "src/components/sections/OnlinePreview.tsx"),
  "utf8",
);

describe("首页在线预览 · 标题底色恒定且达到 AA", () => {
  it("标题所在内容盒带 70% 黑实底", () => {
    const i = src.indexOf("absolute inset-x-0 bottom-0 z-10");
    expect(i, "未能定位预览卡底部内容盒").toBeGreaterThan(-1);
    const cls = src.slice(i, src.indexOf('">', i));
    expect(cls, "内容盒缺 bg-black/70：标题会落在图片本身、对比度不可控").toContain(
      "bg-black/70",
    );
  });

  it("内容盒自身不再用渐变当底色（只允许 before: 伪元素用渐变做柔化）", () => {
    const i = src.indexOf("absolute inset-x-0 bottom-0 z-10");
    const cls = src.slice(i, src.indexOf('">', i));
    // 去掉 before: 变体，剩下的若还有 bg-gradient-to-t 就是内容盒自身在渐变
    const own = cls
      .split(/\s+/)
      .filter((t) => !t.startsWith("before:"))
      .join(" ");
    expect(
      own,
      "内容盒自身又用回渐变当底色：标题在盒顶只取到最透明段（实测仅 1.57:1）",
    ).not.toContain("bg-gradient-to-t");
    // 同为说明性注释里的历史值不算，只看真实 className
    const allClassNames = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]).join(" ");
    expect(allClassNames, "className 里又出现 via-black/45").not.toContain("via-black/45");
  });

  it("上方用 before: 伪元素补柔化渐变（消除硬边，且跟随内容盒高度）", () => {
    const i = src.indexOf("absolute inset-x-0 bottom-0 z-10");
    const cls = src.slice(i, src.indexOf('">', i));
    expect(cls, "缺 before:bottom-full：渐变没有贴在内容盒上沿").toContain(
      "before:bottom-full",
    );
    expect(cls, "缺 before:bg-gradient-to-t").toContain("before:bg-gradient-to-t");
    expect(cls, "缺 before:from-black/70：柔化渐变起点与实底不一致会有硬边").toContain(
      "before:from-black/70",
    );
    expect(cls, "缺 before:content-['']：伪元素不会渲染").toMatch(/before:content-\[/);
  });
});
