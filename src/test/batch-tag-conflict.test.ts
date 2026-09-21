import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 批量改标签：同名标签不能同时出现在「添加」与「删除」里。
 *
 * 服务端的合并顺序是**先删后加**：
 *   const kept   = current.tags.filter(t => !lowerRemove.has(t.toLowerCase()));
 *   const merged = normalizeTags([...kept, ...addTags]);
 * 于是同一个标签既在 addTags 又在 removeTags 时，删掉之后又被加回来 ——
 * 最终结果是「标签还在」，与用户在删除框里写下它的意图**正好相反**。
 *
 * 而弹窗此前既不提示也不拦截：用户点完「应用到 N 张」，标签没掉，
 * 只会以为是自己写错了。无头/服务端都测不出这是 bug（服务端行为是确定的），
 * 它是纯粹的交互缺陷 —— 所以要在 UI 层拦下来。
 *
 * 修法：交集检测 + 常驻可见提示 + 禁用提交按钮 + 提交时兜底 toast。
 * 这条测试按源码钉住这四件事，防回归。
 */

const src = readFileSync(
  resolve(process.cwd(), "src/features/admin/batch-update-tags-dialog.tsx"),
  "utf8",
);

describe("批量改标签 · 同名标签冲突", () => {
  it("计算 add / remove 的交集（大小写不敏感）", () => {
    expect(src, "缺少交集计算").toMatch(/conflictingTags\s*=\s*removeTags\.filter/);
    // 必须小写比对：服务端 lowerRemove 也是小写比对，否则 ACG / acg 会漏判
    expect(src, "交集必须大小写不敏感").toMatch(/toLowerCase\(\)/);
  });

  it("提交时兜底拦截（回车直发也不能绕过）", () => {
    expect(src, "提交处缺少冲突拦截").toMatch(
      /conflictingTags\.length\s*>\s*0[\s\S]{0,120}toast\.error/,
    );
  });

  it("提交按钮在冲突时禁用", () => {
    expect(src, "按钮未按冲突禁用").toMatch(
      /disabled=\{[^}]*conflictingTags\.length\s*>\s*0[^}]*\}/,
    );
  });

  it("有常驻的可见提示（不只靠 toast）", () => {
    expect(src, "缺少可见告警元素").toMatch(/role="alert"/);
    // 提示要和按钮一样能随输入实时出现，而不是提交后才弹
    const alertIdx = src.indexOf('role="alert"');
    const btnIdx = src.indexOf("type=\"submit\"");
    expect(alertIdx, "告警应在提交按钮之前渲染").toBeLessThan(btnIdx);
  });
});
