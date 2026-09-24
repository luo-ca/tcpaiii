import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * package.json 不应残留「定义了却从无调用」的脚本（P156）。
 *
 * 实测发现的案例：`check:functions`
 *   = tsc -p tsconfig.functions.json --noEmit && node --check edge-functions/...
 *
 * 它的名字听起来像门禁的一部分，但**没有任何地方调用它** ——
 * npm run check 不含它、pre-commit 不含它、README 也没提。
 * 这种死脚本的危害是误导：后来者以为「函数产物有检查」，
 * 实际上那道检查从未跑过，全靠 edge-functions-sync 测试兜着。
 *
 * 处置：删掉（YAGNI）。它唯一不可替代的职责是 `node --check` 语法校验，
 * 而产物已由 edge-functions-sync 测试保证「与源码逐字节一致」——
 * 源码能通过 tsc，产物语法必然合法，这一步是冗余的。
 *
 * 本测试只钉住「已知死脚本不复现」，并列出仍未被引用的脚本供人工判断：
 * 白名单里的是**开发者手动调用**的常规工具（watch / 开发构建），不算死脚本。
 */

const PKG = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

/**
 * 刻意保留的、不需要被任何流程「显式引用」的脚本：
 *   · dev / build:dev / test:watch / preview —— 开发者手动调用
 *   · prepare —— npm 生命周期钩子，由 `npm install` 自动触发（装 git hook），
 *     不写在别的脚本里是正常的
 */
const MANUAL_ONLY = new Set(["dev", "build:dev", "test:watch", "preview", "prepare"]);

describe("package.json 脚本卫生（P156）", () => {
  it("已删除的死脚本不会回来", () => {
    expect(
      PKG.scripts["check:functions"],
      "check:functions 又回来了：它没有任何调用方，却让「函数产物有门禁」看起来成立",
    ).toBeUndefined();
  });

  it("每个脚本要么被别的脚本/hook/README 引用，要么在白名单里", () => {
    // 拼接所有「可能引用脚本名」的地方
    const refs: string[] = Object.entries(PKG.scripts)
      .filter(([name]) => name !== "prepare")
      .map(([, cmd]) => cmd);
    try {
      refs.push(readFileSync(resolve(process.cwd(), "README.md"), "utf8"));
    } catch {
      // README 缺失不影响本断言
    }
    const hooksRoot = resolve(process.cwd(), "scripts");
    for (const dir of readdirSync(hooksRoot)) {
      const full = join(hooksRoot, dir);
      if (!statSync(full).isDirectory()) continue;
      const candidate = join(full, "pre-commit");
      try {
        refs.push(readFileSync(candidate, "utf8"));
      } catch {
        // 该目录下没有 pre-commit
      }
    }
    const haystack = refs.join("\n");

    const orphans = Object.keys(PKG.scripts).filter((name) => {
      if (MANUAL_ONLY.has(name)) return false;
      // 自身定义不算引用
      const others = Object.entries(PKG.scripts)
        .filter(([k]) => k !== name)
        .map(([, v]) => v)
        .join("\n");
      return !others.includes(name) && !haystack.includes(`npm run ${name}`) && !haystack.includes(name + " ");
    });

    expect(
      orphans,
      "以下脚本没有任何调用方 —— 要么接进流程，要么删掉（不要让门禁看起来比实际更全）：\n" +
        orphans.join("\n"),
    ).toEqual([]);
  });

  it("门禁链完整：check 覆盖 lint + typecheck + test + build", () => {
    const check = PKG.scripts["check"] ?? "";
    for (const step of ["lint", "typecheck", "test", "build"]) {
      expect(check, `npm run check 未包含 ${step}`).toContain(`npm run ${step}`);
    }
  });

  it("pre-commit 必跑的三项脚本都存在", () => {
    for (const s of ["lint", "typecheck", "test"]) {
      expect(PKG.scripts[s], `package.json 缺 ${s} 脚本，pre-commit 会失败`).toBeTruthy();
    }
  });
});