import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * 提取源码里的字符串字面量（反引号模板串 / 双引号 / 单引号），并给出行号。
 *
 * 为什么不抓 `className=`：类名字符串可能出现在
 *   · `className="…"` / `className={`…`}` 属性里
 *   · `cn("…", …)` 调用里
 *   · 像 gallery-browse 的 `chipClass` 那种「返回类名模板串」的辅助函数里
 * 只认 `className=` 会漏掉后两类，正是它让这轮回归一开始对
 * `gallery-browse.tsx:126` 视而不见。抓字面量三类都能覆盖。
 *
 * 反引号分支 `[^`]*` 能吞掉模板串里的 `${…}`（含其中的引号），
 * 因此跨行模板串也能整段取出，不受「收尾反引号在下一行」的影响。
 */
function literals(source: string): Array<{ text: string; line: number }> {
  const out: Array<{ text: string; line: number }> = [];
  const re = /`[^`]*`|"[^"\n]*"|'[^'\n]*'/g;
  for (const m of source.matchAll(re)) {
    const index = m.index ?? 0;
    const lineStart = source.lastIndexOf("\n", index - 1) + 1;
    let lineEnd = source.indexOf("\n", index);
    if (lineEnd === -1) lineEnd = source.length;
    const lineText = source.slice(lineStart, lineEnd).trim();
    // 跳过注释行：说明性文字里会引用这些类名作反例
    if (lineText.startsWith("*") || lineText.startsWith("//") || lineText.startsWith("/*")) continue;
    const line = source.slice(0, index).split("\n").length;
    out.push({ text: m[0], line });
  }
  return out;
}

/** 从某文件里取出「参与类名判断」的字面量，并附带相对路径。 */
function classLiterals(rel: string): Array<{ text: string; line: number; rel: string }> {
  const src = readFileSync(resolve(process.cwd(), rel), "utf8");
  return literals(src).map((l) => ({ ...l, rel }));
}

const COLOR =
  "(?:brand|iris|foreground|background|card|popover|secondary|muted|accent|ink|primary|destructive|success|warning|black|white|red|green|blue|orange|amber|yellow|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)";
const TEXT_COLOR = new RegExp(`\\btext-${COLOR}(?:-\\d+)?\\b`);
const TEXT_SIZE = /\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b/;

/**
 * 每条规则 = 一个设计系统类（写在 src/index.css 的 `@layer utilities` 里），
 * 加上「它用自己的声明独占、因而会架空的 Tailwind 工具类」。
 */
const RULES: Array<{ id: string; cls: RegExp; forbid: RegExp; note: string }> = [
  {
    id: "page-bg",
    cls: /\bpage-bg\b/,
    // .page-bg { background: var(--color-background); min-height: 100vh }
    // 用的是 background 简写，会连背景色/背景图一起接管。
    forbid: new RegExp(
      `\\bmin-h-(?:screen|full|svh|lvh|dvh)|\\bbg-${COLOR}(?:-\\d+)?\\b|\\bbg-gradient-`
    ),
    note: "背景与最小高度由 .page-bg 独占",
  },
  {
    id: "gradient-button",
    cls: /\bgradient-button\b/,
    // .gradient-button { background-image; border: 2px solid ink; box-shadow; transition }
    // background-image 与 Tailwind 的 background-color 属不同属性，故 bg-* 不算冲突。
    forbid: /\bborder-|\bshadow-|\btransition-/,
    note: "边框/硬投影/过渡由 .gradient-button 独占（背景走 background-image，bg-* 不冲突）",
  },
  {
    id: "category-button",
    cls: /\bcategory-button\b/,
    // .category-button { transition: …; position: relative }
    forbid: /\btransition-|\b(?:static|fixed|absolute|relative|sticky)\b/,
    note: "过渡与定位由 .category-button 独占",
  },
  {
    id: "card-button",
    cls: /\bcard-button\b/,
    // .card-button { transition: …; border-radius: 8px }
    forbid: /\btransition-|\brounded-/,
    note: "过渡与圆角由 .card-button 独占",
  },
  {
    id: "code-block",
    cls: /\bcode-block(?!-)/,
    // .code-block { background; border-radius: 12px; overflow: hidden; border; box-shadow }
    forbid: new RegExp(
      `\\brounded-|\\boverflow-|\\bborder-|\\bshadow-|\\bbg-${COLOR}(?:-\\d+)?\\b`
    ),
    note: "圆角/裁切/边框/底色由 .code-block 独占",
  },
  {
    id: "kana-label",
    cls: /\bkana-label\b/,
    // .kana-label { font-size; font-weight; line-height; letter-spacing; text-transform; color }
    forbid: new RegExp(
      `${TEXT_COLOR.source}|${TEXT_SIZE.source}|\\bfont-|\\bleading-|\\btracking-|\\b(?:uppercase|lowercase|capitalize)\\b`
    ),
    note: "字号/字重/行高/字距/大小写/颜色由 .kana-label 独占",
  },
];

/**
 * 设计系统类（src/index.css 的 `@layer utilities`）在产物 CSS 里排在
 * Tailwind 生成的工具类之后，两者特异性相同（都是单类）。于是**任何**
 * 落在同一元素（即同一类名字符串）上的、设置同一 CSS 属性的 Tailwind
 * 工具类都会被静默架空，成为永不生效的死类。
 *
 * P23 已在 .glass* / border-<色> 这一对上实证并加了闸；这里把同一根因扩展到
 * 其余六个设计系统类。活生生的例子（都曾真实存在，本 P24 逐一修掉）：
 *   .min-h-screen                 被 .page-bg{min-height:100vh} 盖              → App.tsx 外框
 *   .rounded-lg                   被 .card-button{border-radius:8px} 盖          → 文档复制按钮
 *   .rounded-xl / .overflow-hidden 被 .code-block{…;overflow:hidden} 盖          → 3 处代码块
 *   .text-brand-600               被 .kana-label{color:var(--color-muted-foreground)} 盖 → Hero 片假名
 *   .transition-all               被 .category-button{transition:…} 盖           → 5 处分类标签
 *   .border-0                     被 .gradient-button{border:2px solid …} 盖     → admin 两处提交按钮
 *
 * 修法遵循 P23 先例：设计意图归属设计系统类时，**移除必然失效的工具类**，
 * 而不是给工具类打 !important 或反向改优先级。
 */
describe("设计系统类不得被同属性 Tailwind 工具类架空", () => {
  it("全站没有「设计系统类 + 同属性工具类」的死类组合", () => {
    const offenders: string[] = [];
    for (const file of walk(resolve(process.cwd(), "src"))) {
      if (file.includes(join("src", "test"))) continue;
      const source = readFileSync(file, "utf8");
      const rel = relative(process.cwd(), file).replace(/\\/g, "/");
      for (const { text, line } of literals(source)) {
        for (const rule of RULES) {
          if (rule.cls.test(text) && rule.forbid.test(text)) {
            offenders.push(`${rel}:${line} [${rule.id}] ${rule.note}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  // ── 站点级意图锁定：让回归信息直指「期望的设计归属」 ──────────────────
  it("page-bg 独占最小高度，App 外框不再挂 min-h-screen", () => {
    const pageBg = classLiterals("src/App.tsx").find((c) => /\bpage-bg\b/.test(c.text));
    expect(pageBg).toBeTruthy();
    expect(pageBg!.text).not.toMatch(/\bmin-h-(?:screen|full)/);
  });

  it("code-block 自带 12px 圆角与 overflow:hidden，不再挂 rounded-*/overflow-*", () => {
    const blocks = classLiterals("src/components/sections/ApiDocsSection.tsx").filter((c) =>
      /\bcode-block(?!-)/.test(c.text)
    );
    expect(blocks.length).toBe(3);
    for (const b of blocks) expect(b.text).not.toMatch(/\brounded-|\boverflow-/);
  });

  it("card-button 自带 8px 圆角，文档复制按钮不再挂 rounded-lg", () => {
    const cardBtn = classLiterals("src/components/sections/ApiDocsSection.tsx").find((c) =>
      /\bcard-button\b/.test(c.text)
    );
    expect(cardBtn).toBeTruthy();
    expect(cardBtn!.text).not.toMatch(/\brounded-/);
  });

  it("kana-label 自带 muted 颜色，Hero 片假名不再挂 text-brand-600", () => {
    const kana = classLiterals("src/components/sections/HeroSection.tsx").find((c) =>
      /\bkana-label\b/.test(c.text)
    );
    expect(kana).toBeTruthy();
    expect(kana!.text).not.toMatch(TEXT_COLOR);
  });

  it("贴纸主按钮收敛到 sticker 变体单点，调用处不再挂 gradient-button", () => {
    // P36 起 8 处「gradient-button … text-white」副本归入 buttonVariants.sticker，
    // 与 TagChip（category-button）同一先例：字面量只允许出现在单点定义里，
    // 且单点串自身不得带被独占属性冲突的工具类（border-*/shadow-*/transition-*）。
    const grads = classLiterals("src/components/ui/button.tsx").filter((c) =>
      /\bgradient-button\b/.test(c.text)
    );
    expect(grads.length).toBe(1);
    for (const g of grads) expect(g.text).not.toMatch(/\bborder-|\bshadow-|\btransition-/);
    for (const rel of [
      "src/features/admin-page.tsx",
      "src/features/admin/add-image-dialog.tsx",
      "src/features/admin/edit-image-dialog.tsx",
      "src/features/admin/batch-update-tags-dialog.tsx",
      "src/features/admin/image-card.tsx",
      "src/components/sections/DocsTeaser.tsx",
      "src/components/sections/HeroSection.tsx",
      "src/components/sections/ImageSubmission.tsx",
      "src/components/sections/OnlinePreview.tsx",
    ]) {
      expect(classLiterals(rel).filter((c) => /\bgradient-button\b/.test(c.text))).toEqual([]);
    }
  });

  it("分类标签 chip 收敛到 TagChip 单点，且不再挂 transition-*", () => {
    // P32 起三处筛选标签共用 <TagChip>，category-button 字面量只允许出现在单点定义里
    const chips = classLiterals("src/components/ui/tag-chip.tsx").filter((c) =>
      /\bcategory-button\b/.test(c.text)
    );
    expect(chips.length).toBeGreaterThan(0);
    for (const c of chips) expect(c.text).not.toMatch(/\btransition-/);
    for (const rel of [
      "src/components/sections/OnlinePreview.tsx",
      "src/features/gallery-browse.tsx",
      "src/features/admin-page.tsx",
    ]) {
      expect(classLiterals(rel).filter((c) => /\bcategory-button\b/.test(c.text))).toEqual([]);
    }
  });

  it("非 token 的 Tailwind palette 数值色不得出现在类名里", () => {
    // P32 补全语义色梯度（*-soft/*-line/*-ink/*-bright）后，
    // emerald/amber/red 这类手搓 palette 色失去存在理由，锁死防再生。
    const PALETTE =
      /\b(?:bg|text|border|from|via|to|fill|stroke|ring|divide|placeholder|decoration|shadow)-(?:red|green|blue|orange|amber|yellow|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/;
    const offenders: string[] = [];
    for (const file of walk(resolve(process.cwd(), "src"))) {
      if (file.includes(join("src", "test"))) continue;
      const source = readFileSync(file, "utf8");
      const rel = relative(process.cwd(), file).replace(/\\/g, "/");
      for (const { text, line } of literals(source)) {
        if (PALETTE.test(text)) offenders.push(`${rel}:${line} ${text.slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
