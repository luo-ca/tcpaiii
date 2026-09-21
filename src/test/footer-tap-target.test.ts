import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 移动端可点区域下限回归（P58）。
 *
 * 用无头浏览器在 320 / 390 / 768 / 1280 / 1920 五档视口跑真实布局后测得：
 * 页脚 7 个链接的盒子高度都只有 16px（`text-xs` 的行盒），低于 WCAG 2.2
 * 「指针目标 ≥ 24×24」的下限，也低于移动端手指可信命中范围。它们在每个
 * 路由的页脚都出现一次，是当时唯一低于阈值的可点元素（`跳到主内容` 是
 * sr-only 跳转链，聚焦时才显形，不在此列）。
 *
 * 修法：给每个页脚链接补 `min-h-6`（24px）并内联居中。这里按源码钉住，
 * 避免以后改样式时又把高度压回纯文本行高。
 */

const footerSource = readFileSync(
  resolve(process.cwd(), "src/components/layout/Footer.tsx"),
  "utf8",
);

/** 抽出页脚里所有 <a> / <NavLink> 的 className 字符串 */
function linkClassNames(source: string): string[] {
  return [...source.matchAll(/className="([^"]*)"/g)]
    .map((m) => m[1])
    .filter((cls) => cls.includes("hover:text-foreground"));
}

describe("页脚链接 · 触摸目标不低于 24px", () => {
  it("页脚共 7 个链接，全部带 min-h-6", () => {
    const classes = linkClassNames(footerSource);
    expect(classes.length).toBe(7);
    for (const cls of classes) {
      expect(cls, `缺少 min-h-6：${cls}`).toContain("min-h-6");
      expect(cls, `缺少 inline-flex：${cls}`).toContain("inline-flex");
      expect(cls, `缺少 items-center：${cls}`).toContain("items-center");
    }
  });

  it("没有遗留未加高的裸链接样式", () => {
    // 旧写法（纯文本行盒，16px 高）不得复活
    expect(footerSource).not.toMatch(/className="hover:text-foreground transition-colors"/);
    expect(footerSource).not.toMatch(
      /className="hover:text-foreground transition-colors inline-flex items-center gap-1"/,
    );
  });
});
