import { chmodSync, copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 把仓库里的 git hooks 安装到 .git/hooks。
 *
 * 为什么是「脚本安装」而不是「直接提交 .git/hooks」：
 * `.git/` 不进版本库，手工塞进去的钩子只有那台机器上有，换个克隆（或换个人）
 * 就没了门禁。本仓库既没有 CI 也没有 husky，所以必须有这么一步是**可复现**的。
 *
 * 用 Node 而不是 .sh：这个仓库在 Windows 上开发（npm run 走的也是 cmd），
 * install.sh 在这里根本跑不起来。
 *
 * 用法：npm run hooks:install
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function gitHooksDir() {
  // 尊重 core.hooksPath：有人可能把它指到别处
  try {
    const configured = execFileSync("git", ["config", "core.hooksPath"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    if (configured) return resolve(repoRoot, configured);
  } catch {
    // 没配置就走默认路径
  }
  return join(repoRoot, ".git", "hooks");
}

const srcDir = join(repoRoot, "scripts", "git-hooks");
const dstDir = gitHooksDir();

if (!existsSync(dstDir)) {
  console.error(`找不到 hooks 目录：${dstDir}（这里不是 git 仓库？）`);
  process.exit(1);
}

const installed = [];
for (const name of readdirSync(srcDir)) {
  if (!/^[a-z-]+$/.test(name)) continue; // 只装钩子本体，跳过 install.* 之类
  const from = join(srcDir, name);
  const to = join(dstDir, name);
  copyFileSync(from, to);
  // 保证 LF 且可执行：CRLF 会让 sh 报 bad interpreter
  const content = readFileSync(to, "utf8").replace(/\r\n/g, "\n");
  writeFileSync(to, content);
  try {
    chmodSync(to, 0o755);
  } catch {
    // Windows 上 chmod 基本是 no-op，忽略
  }
  installed.push(name);
}

if (installed.length === 0) {
  console.error(`在 ${srcDir} 里没找到任何钩子`);
  process.exit(1);
}

console.log(`已安装到 ${dstDir}：\n  ${installed.join("\n  ")}`);
console.log("\n跳过某次检查：SKIP_PRECOMMIT=1 git commit ...");
