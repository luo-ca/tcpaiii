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
  // prepare 会在 npm install 时自动跑，而 CI / 打包产物里可能没有 .git。
  // 那种环境下装不了钩子属于正常，不该让整个安装失败。
  console.log(`跳过：找不到 hooks 目录 ${dstDir}（不是 git 工作区？）`);
  process.exit(0);
}

const installed = [];
const backedUp = [];

/**
 * 归一化换行后再比内容：Windows 上 git 可能把已装好的钩子 checkout 成 CRLF，
 * 那是同一份钩子的另一种换行，不该被当成「被改过」。
 *
 * @param {string} text
 * @returns {string}
 */
function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

for (const name of readdirSync(srcDir)) {
  if (!/^[a-z-]+$/.test(name)) continue; // 只装钩子本体，跳过 install.* 之类
  const from = join(srcDir, name);
  const to = join(dstDir, name);
  const incoming = normalize(readFileSync(from, "utf8"));

  // 覆盖前先看目标位置有没有「不是我们这份」的内容。
  //
  // 原先是无条件 copyFileSync：实测往 .git/hooks/pre-commit 放一个自定义钩子，
  // 跑一次安装就被**静默抹掉** —— 没有备份、没有提示。而 prepare 挂在
  // `npm install` 上，意味着用户每装一次依赖，自定义钩子就被重置一次。
  // 这类「悄无声息地覆盖用户文件」是应当避免的，至少要留个痕迹。
  if (existsSync(to)) {
    const existing = normalize(readFileSync(to, "utf8"));
    if (existing !== incoming) {
      const backup = `${to}.bak-${Date.now()}`;
      copyFileSync(to, backup);
      backedUp.push(`${name} -> ${backup}`);
    }
  }

  // 保证 LF 且可执行：CRLF 会让 sh 报 bad interpreter
  writeFileSync(to, incoming);
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
if (backedUp.length > 0) {
  // 明确告知：覆盖了原有内容，但已经备份 —— 用户不会以为自己写的钩子凭空消失
  console.log(
    `\n注意：以下钩子原本已有不同内容，已先备份再覆盖（如需还原请手动改名回去）：\n  ${backedUp.join("\n  ")}`,
  );
}
console.log("\n跳过某次检查：SKIP_PRECOMMIT=1 git commit ...");
