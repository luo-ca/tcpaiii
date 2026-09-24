import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * pre-commit 门禁必须覆盖 lint（P154）。
 *
 * 现状：hook 只跑 typecheck + test，注释说「lint 与 build 更慢，留给显式调用
 * npm run check」。但这条取舍的代价在本会话真实发生过：
 *
 *   · P141 我引入 src/features/admin-page.tsx 的两条
 *     `react-refresh/only-export-components` warning；
 *   · **pre-commit 通过了**（它不跑 lint），是我事后手动跑 npm run lint 才发现；
 *   · 如果当时没跑，warning 会直接进仓库 —— 而这类「导出非组件」的警告
 *     恰恰是 ESLint 能抓、tsc 抓不到的（tsc 只管类型，不管导出形状）。
 *
 * 实测耗时：lint 4.7s / typecheck 8.0s / test 5.0s。把 lint 加进来后
 * hook 总耗时仍在十秒级，换取「warning 不落库」是划算的。
 *
 * 断言：hook 脚本里必须显式调用 npm run lint。
 */

const HOOKS_ROOT = resolve(process.cwd(), "scripts");

const HOOK = (() => {
  // scripts 下的目录名含同形字，按名字查找而不是硬编码路径
  for (const dir of readdirSync(HOOKS_ROOT)) {
    const full = join(HOOKS_ROOT, dir);
    if (!statSync(full).isDirectory()) continue;
    const candidate = join(full, "pre-commit");
    if (existsSync(candidate)) return readFileSync(candidate, "utf8");
  }
  throw new Error("找不到 pre-commit 脚本");
})();

describe("pre-commit 门禁覆盖面（P154）", () => {
  it("跑 typecheck（挡类型错误）", () => {
    expect(HOOK).toMatch(/npm run --silent typecheck/);
  });

  it("跑 test（挡行为回归）", () => {
    expect(HOOK).toMatch(/npm run --silent test/);
  });

  it("跑 lint（挡 warning —— tsc 抓不到那类问题）", () => {
    expect(
      HOOK,
      "pre-commit 不跑 lint：仅含 warning 的问题（如 react-refresh 导出形状）会直接进仓库",
    ).toMatch(/npm run --silent lint/);
  });

  it("保留跳过开关，且跳过时明确提示", () => {
    expect(HOOK).toMatch(/SKIP_PRECOMMIT/);
    expect(HOOK, "跳过时应明确说明，避免静默绕过门禁").toMatch(/跳过门禁/);
  });

  it("set -e：任一步失败即中断（不能带着失败继续提交）", () => {
    expect(HOOK).toMatch(/set -e/);
  });
});