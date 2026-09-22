import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * edge-functions/*.js 是**提交进仓库**的编译产物，也是 EdgeOne 实际部署的东西。
 *
 * 危险在于：源码是 edge-functions-src/*.ts，产物是 edge-functions/*.js。
 * 谁改了 .ts 却忘了跑 npm run build:functions，仓库里就是「源码一套、产物另一套」，
 * 而部署出去的是**产物** —— 线上的行为和源码读起来的不一样。
 *
 * 实测确认过这个缺口是真的：往 response.ts 里加一个响应头、不重新编译，
 * 然后跑门禁 —— lint 通过、259 个测试全绿，没有任何东西发现
 * 「.ts 里有、.js 里没有」。因为测试跑的是 .ts（vitest 直接 import 源码），
 * 而部署跑的是 .js，两边根本没人比对。
 *
 * 修法：这里现场编译到一个临时目录，逐文件与仓库里的产物比对字节。
 * 不一致就说明产物过期，必须重新 build:functions 再提交。
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const repoRoot = resolve(process.cwd());
const builtDir = join(repoRoot, "edge-functions");

describe("edge-functions 产物与源码一致", () => {
  it("提交的 .js 与现场重新编译的结果逐字节相同", () => {
    const tempOut = mkdtempSync(join(tmpdir(), "ef-build-"));
    // 直接调 outDir 覆盖编译：用 tsc 的 --outDir 指向临时目录
    try {
      // 直接调本地 tsc 入口，别经过 npx：
      // Windows 上 spawnSync("npx") 会 ENOENT（npx 是 .cmd，需 shell:true）。
      const tsc = join(repoRoot, "node_modules", "typescript", "bin", "tsc");
      execFileSync(
        process.execPath,
        [tsc, "-p", "tsconfig.functions.json", "--outDir", tempOut],
        { cwd: repoRoot, stdio: "pipe" },
      );
    } catch (error) {
      rmSync(tempOut, { recursive: true, force: true });
      throw new Error(`编译失败：${String(error)}`);
    }

    const fresh = walk(tempOut).filter((f) => f.endsWith(".js"));
    expect(fresh.length, "临时编译没有产出任何 .js").toBeGreaterThan(0);

    const mismatches: string[] = [];
    for (const freshFile of fresh) {
      const rel = freshFile.slice(tempOut.length + 1).replace(/\\/g, "/");
      const committed = join(builtDir, rel);
      let committedCode: string;
      try {
        committedCode = readFileSync(committed, "utf8");
      } catch {
        mismatches.push(`${rel}（仓库里根本没有这个产物）`);
        continue;
      }
      if (committedCode !== readFileSync(freshFile, "utf8")) {
        mismatches.push(`${rel}（内容不一致）`);
      }
    }
    rmSync(tempOut, { recursive: true, force: true });

    expect(
      mismatches,
      "edge-functions 产物已过期：源码改了但没跑 npm run build:functions，而部署的是产物",
    ).toEqual([]);
  }, 60_000);
});
