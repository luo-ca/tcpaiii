import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 管理密钥输入框必须有显隐切换。
 *
 * 背景：这个框是 type="password"，而管理密钥是长串、没有第二次肉眼核对的机会 ——
 * 用户输错了只能点「校验」打一次网络往返才知道。仓库其它地方（批量导入的
 * URL 列表等）都能直接看到内容，唯独这一处最常见的入口动作是盲打。
 *
 * 修法：加一个 Eye/EyeOff 切换按钮，aria-label 与 aria-pressed 随状态翻转。
 *
 * 这条测试按源码钉住三件事：
 *   1. type 是受 showAdminToken 控制的二选一；
 *   2. 有一个可聚焦的 button 做切换（不是不可交互的图标）；
 *   3. 无障碍：aria-label / aria-pressed 随状态变化。
 */

const src = readFileSync(
  resolve(process.cwd(), "src/features/admin-page.tsx"),
  "utf8",
);

describe("管理密钥输入 · 显隐切换", () => {
  it("type 受 showAdminToken 控制", () => {
    expect(src, "输入框 type 未受状态控制").toMatch(
      /type=\{showAdminToken \? 'text' : 'password'\}/,
    );
  });

  it("有切换状态", () => {
    expect(src).toMatch(/const \[showAdminToken, setShowAdminToken\] = useState\(false\)/);
  });

  it("切换用真正的 button（可聚焦、可键盘触发）", () => {
    const i = src.indexOf("setShowAdminToken((v) => !v)");
    expect(i, "找不到切换处理").toBeGreaterThan(0);
    const around = src.slice(Math.max(0, i - 260), i + 520);
    expect(around, "切换必须是 <button type=\"button\">").toContain('type="button"');
    expect(around, "缺少切换的 aria-label").toMatch(/aria-label=\{showAdminToken \?/);
    expect(around, "缺少 aria-pressed（读屏需要知道当前是显还是隐）").toContain(
      "aria-pressed={showAdminToken}",
    );
  });

  it("图标对读屏隐藏（名字由 aria-label 提供，避免重复朗读）", () => {
    const i = src.indexOf("setShowAdminToken((v) => !v)");
    const around = src.slice(Math.max(0, i - 260), i + 640);
    expect(around).toContain('aria-hidden="true"');
  });

  it("输入框给右侧按钮留了内边距，文字不会压到图标", () => {
    const i = src.indexOf('id="admin-token"');
    const around = src.slice(i, i + 420);
    expect(around, "缺少 pr-10，长密钥会压到切换图标上").toContain("pr-10");
  });
});
