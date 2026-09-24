import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 批量导入进度必须能被读屏感知（P115）。
 *
 * 批量导入单次最多 500 张，是个会长跑的异步过程，界面上有
 * 「添加进度 N / M」+ 一根进度条。但两处都只是视觉元素：
 *   · 文本行没有 aria-live，N 在变但读屏不会播报；
 *   · 进度条只是两个 div（没有 role="progressbar"），
 *     读屏连「这是个进度条、现在到哪」都无从得知。
 *
 * 明眼用户能看着进度走，读屏用户点完「导入」后是一片静默 ——
 * 既不知道有没有开始，也不知道什么时候结束。
 *
 * 修法：文本行补 role="status" aria-live="polite"；进度条补
 * role="progressbar" + aria-valuemin/max/now + aria-label。
 */

const src = readFileSync(
  resolve(process.cwd(), "src/features/admin/add-image-dialog.tsx"),
  "utf8",
);

describe("批量导入 · 进度对读屏可见", () => {
  it("进度文本是 polite 状态区（N / M 变化会被播报）", () => {
    const i = src.indexOf("添加进度");
    expect(i, "未能定位进度文本").toBeGreaterThan(-1);
    const around = src.slice(Math.max(0, i - 320), i + 40);
    expect(around, "进度文本缺 role=status").toContain('role="status"');
    expect(around, "进度文本缺 aria-live").toContain('aria-live="polite"');
  });

  it("进度条本体有 progressbar 语义", () => {
    const i = src.indexOf('role="progressbar"');
    expect(i, "进度条缺 role=progressbar").toBeGreaterThan(-1);
    const block = src.slice(i, i + 420);
    expect(block, "缺 aria-valuemin").toContain("aria-valuemin={0}");
    expect(block, "缺 aria-valuemax（读屏需要知道总量）").toMatch(/aria-valuemax=\{progress\.total\}/);
    expect(block, "缺 aria-valuenow（读屏需要知道当前值）").toMatch(/aria-valuenow=\{progress\.current\}/);
    expect(block, "缺 aria-label").toMatch(/aria-label="[^"]+"/);
  });
});
