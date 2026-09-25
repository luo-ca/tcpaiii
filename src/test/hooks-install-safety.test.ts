import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * 钩子安装器不得静默覆盖用户已有的钩子（P183）。
 *
 * 实测（临时 git 仓库里往 .git/hooks/pre-commit 放一个自定义钩子，再跑安装器）：
 *   修复前 → 自定义钩子被**静默抹掉**：无备份、无提示
 *   修复后 → 先备份成 pre-commit.bak-<ts>，并明确打印「已先备份再覆盖」
 *
 * 为什么这条值得钉：`hooks:install` 挂在 `prepare` 上，也就是**每次 npm install
 * 都会跑一次**。用户若有自定义钩子（或用了别的工具装的钩子），每装一次依赖就被
 * 重置一次，而且界面上什么都不会说 —— 属「静默覆盖用户文件」。
 *
 * 同时验证不误伤正常场景：内容相同（含仅换行符不同）时不该产生备份，
 * 否则每次 npm install 都会堆一堆 .bak 文件。
 */

const REPO = resolve(process.cwd());
const tmpRepos: string[] = [];

function makeRepo(): string {
  const tmp = mkdtempSync(join(tmpdir(), "tcpaiii-hook-test-"));
  tmpRepos.push(tmp);
  execFileSync("git", ["init", "-q"], { cwd: tmp });
  mkdirSync(join(tmp, "scripts", "git-hooks"), { recursive: true });
  copyFileSync(join(REPO, "scripts/git-hooks/install.mjs"), join(tmp, "scripts/git-hooks/install.mjs"));
  copyFileSync(join(REPO, "scripts/git-hooks/pre-commit"), join(tmp, "scripts/git-hooks/pre-commit"));
  return tmp;
}

function install(tmp: string): string {
  return execFileSync(process.execPath, [join(tmp, "scripts/git-hooks/install.mjs")], {
    cwd: tmp,
    encoding: "utf8",
  });
}

afterEach(() => {
  while (tmpRepos.length) {
    const p = tmpRepos.pop();
    if (p) rmSync(p, { recursive: true, force: true });
  }
});

describe("hooks:install · 不静默覆盖用户钩子（P183）", () => {
  it("目标位置已有不同内容时先备份，并明确提示", () => {
    const tmp = makeRepo();
    const hook = join(tmp, ".git", "hooks", "pre-commit");
    writeFileSync(hook, "#!/bin/sh\necho USER CUSTOM HOOK\n");

    const out = install(tmp);

    expect(out, "覆盖了用户钩子却没有提示").toMatch(/已先备份/);
    const backups = readdirSync(join(tmp, ".git", "hooks")).filter((f) => f.startsWith("pre-commit.bak-"));
    expect(backups.length, "没有生成备份文件").toBe(1);
    expect(
      readFileSync(join(tmp, ".git", "hooks", backups[0]), "utf8"),
      "备份内容不是用户原来那份",
    ).toContain("USER CUSTOM HOOK");
    expect(readFileSync(hook, "utf8"), "钩子本体没被更新为仓库版本").toContain("提交前门禁");
  });

  it("首次安装（没有既有钩子）不产生备份", () => {
    const tmp = makeRepo();
    const out = install(tmp);
    expect(out, "首次安装不该有备份提示").not.toMatch(/已先备份/);
    const backups = readdirSync(join(tmp, ".git", "hooks")).filter((f) => f.includes(".bak-"));
    expect(backups.length).toBe(0);
  });

  it("重复安装（内容相同）不产生备份 —— 否则每次 npm install 都堆 .bak", () => {
    const tmp = makeRepo();
    install(tmp);
    const out = install(tmp);
    expect(out, "内容相同却触发了备份").not.toMatch(/已先备份/);
    const backups = readdirSync(join(tmp, ".git", "hooks")).filter((f) => f.includes(".bak-"));
    expect(backups.length).toBe(0);
  });

  it("仅换行符不同时不当作「被改过」（Windows checkout 常见）", () => {
    const tmp = makeRepo();
    install(tmp);
    const hook = join(tmp, ".git", "hooks", "pre-commit");
    // 模拟 CRLF checkout
    writeFileSync(hook, readFileSync(hook, "utf8").replace(/\n/g, "\r\n"));

    const out = install(tmp);

    expect(out, "CRLF 变体被误判成用户改动").not.toMatch(/已先备份/);
    expect(readFileSync(hook, "utf8"), "安装后应归一为 LF").not.toContain("\r\n");
  });

  it("非 git 工作区时安静跳过，不算失败", () => {
    const tmp = mkdtempSync(join(tmpdir(), "tcpaiii-nogit-"));
    tmpRepos.push(tmp);
    mkdirSync(join(tmp, "scripts", "git-hooks"), { recursive: true });
    copyFileSync(join(REPO, "scripts/git-hooks/install.mjs"), join(tmp, "scripts/git-hooks/install.mjs"));
    copyFileSync(join(REPO, "scripts/git-hooks/pre-commit"), join(tmp, "scripts/git-hooks/pre-commit"));

    const out = execFileSync(process.execPath, [join(tmp, "scripts/git-hooks/install.mjs")], {
      cwd: tmp,
      encoding: "utf8",
    });

    expect(out, "没有 .git 时应说明原因而不是静默/报错").toMatch(/跳过/);
    expect(existsSync(join(tmp, ".git")), "不该自己造一个 .git").toBe(false);
  });
});
