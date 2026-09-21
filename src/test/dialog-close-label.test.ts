import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 浮层图标按钮的可访问名一致性。
 *
 * 用无头浏览器真开一次图库灯箱实测（mock API + /gallery）：
 *   修复前 —— dialog 内四个按钮的 aria-label 依次是
 *             (none) | 上一张 | 下一张 | (none)
 *   修复后 —— (none) | 上一张 | 下一张 | 关闭
 *
 * 两个 (none) 里，第一个是无障碍特性正常的「复制地址」（有可见文字，
 * 可访问名由文字提供）；第二个是 DialogContent 自带的关闭 X —— 它只有
 * 一个 sr-only 的视觉隐藏 span 提供名字，与相邻两个图标按钮（上/下一张
 * 走 aria-label）风格不一致，且名字一旦被裁剪/改写就会退化成无名的「X」。
 *
 * 本测试钉住：Dialog 的关闭按钮必须自带 aria-label，且与 sr-only 文案一致。
 */

const dialogSource = readFileSync(
  resolve(process.cwd(), "src/components/ui/dialog.tsx"),
  "utf8",
);

describe("Dialog 关闭按钮 · 必须有显式 aria-label", () => {
  it("DialogPrimitive.Close 带 aria-label=\"关闭\"", () => {
    const closeBlock = dialogSource.slice(
      dialogSource.indexOf("<DialogPrimitive.Close"),
      dialogSource.indexOf("</DialogPrimitive.Close>"),
    );
    expect(closeBlock, "未能定位 DialogPrimitive.Close").not.toBe("");
    expect(
      closeBlock,
      '关闭按钮缺少 aria-label="关闭"：可访问名不应只依赖 sr-only 文案',
    ).toContain('aria-label="关闭"');
  });

  it("关闭按钮的图标仍是 aria-hidden，不与 aria-label 重复朗读", () => {
    const closeBlock = dialogSource.slice(
      dialogSource.indexOf("<DialogPrimitive.Close"),
      dialogSource.indexOf("</DialogPrimitive.Close>"),
    );
    expect(closeBlock).toMatch(/<X[^>]*aria-hidden="true"/);
  });
});
