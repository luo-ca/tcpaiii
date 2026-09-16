import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * 浮层可见性契约：隐藏内容的「hover 才显示」浮层，必须同时照顾触摸设备。
 *
 * 背景：图库卡片（admin / gallery-browse / GalleryPreview）上有一层浮层，
 * 承载标题、标签，以及后台卡片的复制/编辑/删除按钮。桌面端用
 * `opacity-0 group-hover:opacity-100` 做成悬停显示 —— 但**触摸设备没有 hover**，
 * 如果把 `opacity-0` 无条件写死，手机上这些内容就永远看不到、按钮也点不到。
 *
 * 正确做法是用 `pointer-coarse:` 变体（Tailwind v4 原生，编译为
 * `@media (pointer: coarse)`）覆盖，即：
 *   `opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100`
 *
 * 这里曾经踩过两个坑，本测试把两者都钉死：
 *  1. 用**视口宽度**近似指针能力（`sm:group-hover:opacity-100` / `sm:opacity-0`）。
 *     768px 的 iPad 宽度 ≥sm，却是触摸屏、没有 hover —— 浮层被永久藏住。
 *     宽度和指针能力是两回事，任何时候都不许再用断点近似。
 *  2. 只写 `group-hover:` 忘了 `pointer-coarse:`，触摸端直接失能。
 */
describe("浮层可见性：触摸设备必须看得见 hover 浮层", () => {
  const files = walk(resolve(process.cwd(), "src")).filter(
    (file) => !file.includes("__probe") && !/[\\/]test[\\/]/.test(file),
  );

  /** 收集源码行（跳过注释行，说明性文字里会提到这些写法） */
  function scanLines(): { file: string; line: number; text: string }[] {
    const rows: { file: string; line: number; text: string }[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      source.split(/\r?\n/).forEach((text, index) => {
        const trimmed = text.trim();
        if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) return;
        rows.push({ file, line: index + 1, text });
      });
    }
    return rows;
  }

  it("不得用视口断点近似指针能力（sm:/md:/lg: + group-hover）", () => {
    const offenders = scanLines()
      .filter(({ text }) => /\b(sm|md|lg|xl|2xl):group-hover\b/.test(text))
      .map(({ file, line }) => `${file}:${line}`);
    expect(offenders).toEqual([]);
  });

  it("隐藏式 hover 浮层必须带 pointer-coarse 兜底", () => {
    const offenders = scanLines()
      .filter(({ text }) => /opacity-0/.test(text) && /group-hover:opacity-100/.test(text))
      .filter(({ text }) => !/pointer-coarse:opacity-100/.test(text))
      .map(({ file, line }) => `${file}:${line}`);
    expect(offenders).toEqual([]);
  });

  it("至少存在一处 pointer-coarse 兜底（契约未被整体删除）", () => {
    const hits = scanLines().filter(({ text }) => /pointer-coarse:opacity-100/.test(text));
    expect(hits.length).toBeGreaterThanOrEqual(3);
  });
});
