import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 表单提交守卫必须在 await 之前置位（P142）。
 *
 * 实测提交路径（单张添加 / 编辑 / 批量改标签同形）：
 *
 *   const handleSubmit = (e) => {
 *     e.preventDefault();
 *     void (async () => {
 *       if (!(await onRequireToken())) return;   // ← 这里有网络往返
 *       ...
 *       setLoading(true);                        // ← 守卫在这里才置位
 *       mutation.mutate(...);
 *     })();
 *   };
 *
 * 密钥尚未验证时 onRequireToken 会打一次 /api/admin/verify。这段往返期间
 * loading 仍是 false，提交按钮 enabled —— 用户连点就进入第二个 handleSubmit，
 * 两个 await 都返回后触发两次 mutation：
 *
 *   · 单张添加：同一 URL 发两次 POST，第二次 409「该图片地址已存在」→ 误报失败
 *   · 编辑：同一张图 PUT 两次（幂等，但白耗一次写入）
 *   · 批量改标签：同一批 id 处理两遍
 *
 * 修法：进入异步体后**立刻**占位，再用 try/finally 归还；校验失败要归还，
 * 否则按钮会永久卡在 disabled。
 */

/** 每个待检提交函数：文件 + 函数名 */
const CASES: Array<{ file: string; fn: string }> = [
  { file: "src/features/admin/add-image-dialog.tsx", fn: "handleSingleSubmit" },
  { file: "src/features/admin/add-image-dialog.tsx", fn: "handleBatchSubmit" },
  { file: "src/features/admin/edit-image-dialog.tsx", fn: "handleSubmit" },
  { file: "src/features/admin/batch-update-tags-dialog.tsx", fn: "handleSubmit" },
];

function bodyOf(file: string, fn: string): string {
  const src = readFileSync(resolve(process.cwd(), file), "utf8");
  const start = src.indexOf(`const ${fn}`);
  expect(start, `${file} 找不到 ${fn}`).toBeGreaterThan(-1);
  const end = src.indexOf("return (", start);
  return src.slice(start, end > start ? end : src.length);
}

describe("后台表单 · 提交守卫时序（P142）", () => {
  describe.each(CASES)("$file → $fn", ({ file, fn }) => {
    it("守卫位在 await onRequireToken 之前（连点不会触发第二次提交）", () => {
      const body = bodyOf(file, fn);
      const guardAt = body.search(/setLoading\s*\(\s*true\s*\)/);
      const awaitAt = body.search(/await\s+onRequireToken\s*\(/);

      expect(guardAt, `${file}: 找不到置位守卫`).toBeGreaterThan(-1);
      expect(awaitAt, `${file}: 找不到 onRequireToken 调用`).toBeGreaterThan(-1);
      expect(
        guardAt,
        `${file} ${fn}: setLoading(true) 在 await onRequireToken 之后 —— 校验往返期间按钮仍可点`,
      ).toBeLessThan(awaitAt);
    });

    it("守卫可被归还（校验失败后按钮不会永久禁用）", () => {
      const body = bodyOf(file, fn);
      expect(
        /setLoading\s*\(\s*false\s*\)/.test(body),
        `${file} ${fn}: 守卫未归还，校验失败后提交按钮会永久禁用`,
      ).toBe(true);
    });
  });
});