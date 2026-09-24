import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stripControlChars } from "@/lib/text";

/**
 * 搜索框 / 标签框的输入也要剔控制字符（P151）。
 *
 * P149 修的是「从地址栏读入」那条路（readGalleryQuery）。但用户**直接打字 /
 * 粘贴**进搜索框是另一条独立入口，不经过那个函数：
 *
 *   gallery-browse:  const searchQuery = debouncedSearchTerm.trim();
 *   admin-page:      const searchQuery = debouncedSearchTerm.trim();
 *   HeroSection:     onRequestRandom(tagInput.trim() || undefined);
 *
 * 三处都只 trim。而 Ctrl+V 带进控制字符很常见（从终端、PDF、某些网页复制）。
 *
 * 后果与 P149 同型、但用户更难自查：
 *   · 搜索框视觉上是空的（控制字符零宽），页面却是「没有匹配的图片」；
 *   · 「清空筛选」按钮的状态与用户看到的不一致；
 *   · HeroSection 的 tag 会直接进 /api/random?tag=...，永远取不到图。
 *
 * 断言方式：这三处都必须经过 stripControlChars（共享实现），
 * 而不是各自再写一份 trim —— 那样迟早漂移。
 */

const SHARED = readFileSync(resolve(process.cwd(), "src/lib/text.ts"), "utf8");

const SEARCH_SITES = [
  { file: "src/features/gallery-browse.tsx", who: "图库搜索框" },
  { file: "src/features/admin-page.tsx", who: "后台搜索框" },
  { file: "src/components/sections/HeroSection.tsx", who: "首页标签框" },
];

describe("搜索/标签输入 · 控制字符收口（P151）", () => {
  it("共享清洗函数在 text.ts 里且导出（三处都复用它）", () => {
    expect(SHARED).toMatch(/export function stripControlChars/);
  });

  it.each(SEARCH_SITES)("$who 的输入经过 stripControlChars", ({ file }) => {
    const src = readFileSync(resolve(process.cwd(), file), "utf8");
    expect(src, `${file} 未引入共享清洗函数`).toMatch(/stripControlChars/);
    expect(
      src,
      `${file} 只做了 trim，控制字符会把「看着空的搜索框」变成真实筛选条件`,
    ).toMatch(/stripControlChars\([^)]*\)\.trim\(\)|stripControlChars\(\s*$/m);
  });

  it("清洗语义正确：看不见的输入等于没输入", () => {
    // 这三处判断「是否有搜索条件」都依赖结果为空串
    expect(stripControlChars("\u0000").trim()).toBe("");
    expect(stripControlChars("\u0000\u0001").trim()).toBe("");
    // 有真实文字时保留
    expect(stripControlChars("风\u0000景").trim()).toBe("风景");
  });
it("标题字段同样剔控制字符（否则「所见搜不到」）", () => {
    // 标题会存进 KV 并渲染为 <h3>{img.title}</h3> 与 alt / aria-label。
    // 含 NUL 时视觉正常（零宽），但搜索是精确子串匹配：
    // 卡片上写着「风景」，用户搜「风景」却匹配不到 "风\u0000景"。
    const add = readFileSync(resolve(process.cwd(), "src/features/admin/add-image-dialog.tsx"), "utf8");
    const edit = readFileSync(resolve(process.cwd(), "src/features/admin/edit-image-dialog.tsx"), "utf8");
    for (const [name, src] of [["add", add], ["edit", edit]]) {
      expect(src, `${name} 的标题未剔控制字符`).toMatch(/stripControlChars\(title\)/);
    }
  });
});