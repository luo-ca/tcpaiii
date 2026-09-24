import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 文档页每一行的「复制」按钮必须有能区分的可访问名。
 *
 * 背景：CodeRow 的按钮可见文字一律是「复制」，而这一屏有 6 个这样的按钮。
 * 读屏用户逐个 Tab 过去只会听到「复制、复制、复制…」，分不清当前聚焦的是
 * 哪一段（302 地址？HTML 示例？JSON 示例？）。视觉用户靠位置和上下文能分辨，
 * 读屏用户不能 —— 这是纯无障碍缺陷，视觉上看不出来。
 *
 * 修法：按行给 aria-label —— 有 label 就用它，没有则退回用代码片段本身
 * （文档页的 code 分别是 randomTagApiUrl / randomExcludeApiUrl /
 * randomJsonApiUrl 等，足以区分）。
 */

const src = readFileSync(
  resolve(process.cwd(), "src/components/sections/ApiDocsSection.tsx"),
  "utf8",
);

describe("文档页复制按钮 · 可访问名可区分", () => {
  it("按钮带 aria-label，且用了 label/code 做区分", () => {
    const i = src.indexOf("aria-label={label ?");
    expect(i, "缺少按行区分的 aria-label").toBeGreaterThan(0);
    const around = src.slice(Math.max(0, i - 40), i + 120);
    expect(around).toContain("label");
    expect(around, "无 label 的行要退回用 code 区分").toContain("code");
  });

  it("可见文字是「复制 / 已复制」两种，没有偏离站内既有文案", () => {
    // 本意是「aria-label 的改造不该顺手改掉可见文案」。
    // P146 给这一屏加了按条区分的就地反馈（与 OnlinePreview / 灯箱一致），
    // 因此文案多了一个「已复制」态 —— 但仍必须是这两个已知值。
    //
    // 注意断言要限定在**可见文案本身**：早先写成对整份源码 not.toMatch(/Copied/)
    // 会误伤标识符（useCopyFeedback / CopyIcon 里都含 "Cop"），是错的。
    const copyLabel = src.match(/<span className="text-xs">\{([^}]+)\}<\/span>/);
    expect(copyLabel, "找不到复制按钮的可见文案").not.toBeNull();
    const expr = copyLabel![1];
    expect(expr, "文案不是二态切换").toContain("copied ?");
    expect(expr, "缺中文「复制」").toContain("复制");
    // 只查**引号里的字符串字面量**（那才是用户看到的字）；
    // 表达式里的 `copied` 是变量名，不该被判成英文文案。
    const literals = [...expr.matchAll(/[\u0027"]([^\u0027"]*)[\u0027"]/g)].map((m) => m[1]);
    expect(literals.length, "没提取到文案字面量").toBeGreaterThanOrEqual(2);
    expect(literals, "文案字面量里混入了英文").not.toContain("Copied");
    expect(literals.join(""), "缺中文文案").toContain("复制");
  });
  it("图标 aria-hidden，名字只由 aria-label 提供，避免重复朗读", () => {
    const i = src.indexOf("aria-label={label ?");
    const around = src.slice(i, i + 320);
    expect(around).toContain('aria-hidden="true"');
  });

  it("多处 CodeRow 时不会退化成同一个名字（静态检查：行数 > 1）", () => {
    const rows = (src.match(/<CodeRow/g) ?? []).length;
    expect(rows, "若只剩一行，这条断言就没意义了").toBeGreaterThan(1);
    // 且确实存在带 label 与不带 label 两种情况 —— aria-label 的两个分支都要覆盖
    const withLabel = (src.match(/<CodeRow[\s\S]*?label="/g) ?? []).length;
    expect(withLabel, "应有带 label 的行").toBeGreaterThan(0);
    expect(withLabel, "也应有不带 label 的行（走 code 分支）").toBeLessThan(rows);
  });
});
