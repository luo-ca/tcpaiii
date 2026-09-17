import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `.section-header p` 不得架空设计系统标签类 `.section-eyebrow` / `.kana-label`。
 *
 * 背景（P25 实证）：`.section-header p` 是**裸元素选择器**（特异性 0,1,1），
 * 而 `.section-eyebrow` / `.kana-label` 是单类（0,1,0）。二者都写在
 * `src/index.css` 的 `@layer utilities` 里，产物 CSS 中 `.section-header p`
 * 排在后面 —— 于是任何挂在 `.section-header` 内的
 *   <p class="section-eyebrow">…</p> / <p class="kana-label">…</p>
 * 都会被静默盖掉 font-size / color / line-height：
 *   · 章节贴纸在 section-header 内是 14/16px 灰字，在外（图库页头 / 管理后台 /
 *     DocsTeaser / Hero）才是设计意图的 11px 品牌蓝 —— 同一语义两种样子；
 *   · 片假名标签在 section-header 内被顶成 14/16px，丢掉 10px + 行高。
 *
 * 修法遵循 P22–P24 先例：**收窄匹配范围**（`:not(.section-eyebrow):not(.kana-label)`），
 * 而不是给任一方的优先级打补丁。本测试把「section-header 的后代 p 规则必须显式
 * 排除这两个标签类」锁成不变量。
 */

const LABELS = ["section-eyebrow", "kana-label"] as const;

/** 去掉注释，避免说明性文字里的选择器被当成真规则。 */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** 摊平 `@layer` 等 at-rule 的花括号层级，逐条取出 `selector { body }`。 */
function rules(css: string): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const selector = m[1].trim();
    if (!selector || selector.startsWith("@")) continue;
    out.push({ selector, body: m[2].trim() });
  }
  return out;
}

/** 取一个复合选择器的最后一段（去掉伪类/伪元素与 `:not(...)` 内容）。 */
function lastCompound(part: string): string {
  const cleaned = part.replace(/::?[a-z-]+\([^)]*\)/gi, "").replace(/::?[a-z-]+/gi, "");
  const comps = cleaned.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  return comps[comps.length - 1] ?? "";
}

const INDEX_CSS = resolve(process.cwd(), "src/index.css");

describe("section-header 后代规则不得架空设计系统标签类", () => {
  it("不存在裸 `.section-header p { … }` 规则（必须用 :not() 排除标签类）", () => {
    const css = stripComments(readFileSync(INDEX_CSS, "utf8"));
    const offenders: string[] = [];
    for (const { selector } of rules(css)) {
      for (const part of selector.split(",")) {
        const t = part.trim();
        if (!t) continue;
        // 只看以 .section-header 开头、且最后一跳命中裸 p 的选择器
        if (!/\.section-header\b/.test(t)) continue;
        if (lastCompound(t) !== "p") continue;
        // 裸 p —— 若未排除两个标签类即为架空源
        const excludesAll = LABELS.every((c) => t.includes(`:not(.${c})`));
        if (!excludesAll) offenders.push(t);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("每个 section-header 的后代 p 规则都显式排除 .section-eyebrow 与 .kana-label", () => {
    const css = stripComments(readFileSync(INDEX_CSS, "utf8"));
    const rulesP = rules(css).filter(
      (r) => /\.section-header\b/.test(r.selector) && lastCompound(r.selector) === "p"
    );
    // 该规则必须真实存在（否则本闸形同虚设）
    expect(rulesP.length).toBeGreaterThan(0);
    for (const { selector } of rulesP) {
      for (const c of LABELS) expect(selector).toContain(`:not(.${c})`);
    }
  });

  it("守卫非空转：确有 <p class=\"section-…\"> 挂在 .section-header 内", () => {
    // 若未来所有站点都改用非 <p> 承载标签，这条随之失效，应同步复核而非静默通过。
    const dir = resolve(process.cwd(), "src");
    const walk = (d: string, out: string[] = []): string[] => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, e.name);
        if (e.isDirectory()) walk(full, out);
        else if (/\.tsx$/.test(e.name) && !full.includes(join("src", "test"))) out.push(full);
      }
      return out;
    };
    const hits = walk(dir).filter((f) => {
      const text = readFileSync(f, "utf8");
      // JSX 里是 className="section-header …"（类名无前导点），故不要求 `\.`
      return (
        /\bsection-header\b/.test(text) &&
        /className="[^"]*(?:section-eyebrow|kana-label)\b/.test(text)
      );
    });
    expect(hits.length).toBeGreaterThan(0);
  });
});
