import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
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
 * .glass* 的 border 简写会吃掉同元素上的 Tailwind 边框色工具类。
 *
 * 背景（P23 实证）：`.glass` / `.glass-strong` / `.glass-card` 用
 * `border: 2px solid var(--color-ink)` 这条**简写**声明边框；它与 Tailwind 的
 * `border-<color>` 工具类同样落在 `@layer utilities`，在产物 CSS 中 glass 一族
 * 排在 Tailwind 工具类之后，二者特异性相同 —— 后出现的简写胜出，把边框颜色
 * 工具类盖成**永不生效的死类**。
 *
 * 这就是 `ErrorState` 外卡曾经挂了 `border-red-200` 却从不渲染红色的原因
 * （构建产物里 `.glass-strong` 位于 `.border-red-200` 之后）。设计上「容器中性
 * 克制」，错误的红色信号由内层图标容器承担，因此这里不是补优先级，而是禁止
 * 这类注定失效的组合再次出现。
 *
 * 注：background 同理（`.glass*` 的 `background: #ffffff` 会盖掉 bg-* 色），
 * 但当前 `--color-card` 就是纯白、无可见差异，暂不纳入断言，避免误伤。
 */
const GLASS = /\bglass(?:-strong|-card)?\b/;
const BORDER_COLOR =
  /\bborder-(?:red|green|blue|orange|amber|yellow|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|brand|iris|secondary|muted|accent|card|popover|white|black|input|border)\b/;

/** 从一行里粗提 className 字符串（单/双引号与模板串都算）。 */
function classStringsOf(line: string): string[] {
  const out: string[] = [];
  for (const m of line.matchAll(/className=(?:\{`([^`]*)`\}|"([^"]*)"|'([^']*)')/g)) {
    out.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  return out;
}

describe("glass 族不得与边框色工具类同元素共存", () => {
  it("全站没有「glass + border-<色>」的死类组合", () => {
    const offenders: string[] = [];
    for (const file of walk(resolve(process.cwd(), "src"))) {
      if (file.includes("src/test")) continue;
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) return;
        for (const cls of classStringsOf(line)) {
          if (GLASS.test(cls) && BORDER_COLOR.test(cls)) {
            offenders.push(`${file}:${index + 1}`);
          }
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("ErrorState 外卡保持中性：不再挂 border-red-200", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/states/ErrorState.tsx"),
      "utf8"
    );
    // 只看真正挂在元素上的 className（单/双引号与模板串都算），避开注释里的说明文字。
    const classes = src.split(/\r?\n/).flatMap(classStringsOf);
    const outer = classes.find((c) => GLASS.test(c)) ?? "";
    expect(outer).toContain("glass-strong");
    expect(outer).not.toContain("border-red-200");
    // 红色信号由内层图标容器承担
    expect(classes.some((c) => c.includes("border-red-200") && c.includes("bg-red-50"))).toBe(
      true
    );
  });
});
