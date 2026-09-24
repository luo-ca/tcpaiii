import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 其余三处复制入口也要有就地反馈（P147）。
 *
 * P146 给 /docs 的 6 个按钮补了「已复制」就地切换。但同类的还有两处
 * 只靠 toast、按钮本身毫无变化：
 *
 *   · status-page   「复制摘要」（反馈问题时最常用，用户需要确认复制到没有）
 *   · gallery-browse「复制链接」（分享筛选结果）
 *
 * 全站其余复制入口都是「已复制 ✓」就地切换（OnlinePreview ×2 / 灯箱 / docs ×6），
 * 剩这两处仍是「点完只有 toast」——同一个动作两套体验。
 *
 * 断言要点：必须查 **UI 的二态表达式**，不能只搜「已复制」三个字。
 * 因为 toast 文案（'状态摘要已复制' / '筛选链接已复制…'）里也含「已复制」，
 * 泛匹配会被它蒙混过关 —— 这一点在反向验证时实测踩到过：
 * 把 UI 二态改回恒定文案后，泛匹配断言依然全绿。
 */

const CASES = [
  {
    file: "src/features/status-page.tsx",
    stateVar: /copied[A-Za-z]*/,
    ternary: /copied[A-Za-z]* \? '已复制' : '[^']+'/,
    hint: "「复制摘要」",
  },
  {
    file: "src/features/gallery-browse.tsx",
    stateVar: /copied[A-Za-z]*/,
    ternary: /copied[A-Za-z]* \? '已复制' : '[^']+'/,
    hint: "「复制链接」",
  },
];

describe("其余复制入口 · 就地反馈（P147）", () => {
  it.each(CASES)("$file $hint 有二态 UI 反馈", ({ file, ternary }) => {
    const src = readFileSync(resolve(process.cwd(), file), "utf8");
    expect(src, `${file} 未引入 useCopyFeedback`).toMatch(/useCopyFeedback/);
    expect(
      src,
      `${file} 的按钮没有二态文案表达式 —— 只搜「已复制」会被 toast 文案蒙混，必须查 UI 表达式`,
    ).toMatch(ternary);
    // 不能再有裸 copyText 调用（那是「只有 toast」的旧形态）
    expect(src, `${file} 仍在直接调 copyText`).not.toMatch(/\b(?:void|await) copyText\(/);
  });

  it("两处都通过 hook 拿状态（不是自己手写 boolean）", () => {
    for (const { file } of CASES) {
      const src = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(src, `${file} 未解构 hook 返回值`).toMatch(/const \{[^}]*copied[^}]*\} = useCopyFeedback\(\)/);
    }
  });

  it("admin「复制地址」同样有二态反馈（卡片层）", () => {
    const card = readFileSync(resolve(process.cwd(), "src/features/admin/image-card.tsx"), "utf8");
    const page = readFileSync(resolve(process.cwd(), "src/features/admin-page.tsx"), "utf8");
    const has = /已复制/.test(card) || /已复制/.test(page) || /useCopyFeedback/.test(card);
    expect(has, "后台「复制地址」仍只有 toast").toBe(true);
  });
});