import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * README 的「提交前门禁」清单必须与钩子实际执行的一致（P181）。
 *
 * 背景：P154 给 pre-commit 补跑了 lint，但 README 那一节只写了
 * 「typecheck + test」两项 —— **漏了 lint**。这是最容易被信错的那类文档：
 * 开发者读完 README 会以为「只查类型和用例」，于是把 lint 才抓得到的问题
 * （如 react-refresh 的导出形状）当成不用管，直到提交时被钩子拦下。
 *
 * 实测核对（本轮）：
 *   钩子 scripts/git-hooks/pre-commit 依次执行 typecheck → lint → test
 *   README 当时只列了 typecheck 与 test
 *
 * 这里把两边的命令集对齐：钩子里出现的 `npm run <script>`（去掉 --silent 等参数）
 * 必须都能在 README 的门禁清单里找到，反之亦然。
 */

const HOOK = readFileSync(resolve(process.cwd(), "scripts/git-hooks/pre-commit"), "utf8");
const README = readFileSync(resolve(process.cwd(), "README.md"), "utf8");

/**
 * 抽出「提交前门禁」里那份清单本身。
 *
 * 不能简单取到下一个二级标题：那一节的后半还有「常用检查」代码块，里面同样有
 * `npm run lint` —— 用整节做 toContain 会在清单漏写 lint 时**依然通过**
 * （实测踩过：把 lint 条目删掉，断言仍然绿）。
 * 所以这里取到「常用检查」为止，只覆盖真正的清单区。
 */
function gateSection(): string {
  const start = README.indexOf("### 提交前门禁");
  expect(start, "README 里找不到「提交前门禁」一节").toBeGreaterThan(-1);
  const cut = README.indexOf("常用检查", start);
  const end = cut > -1 ? cut : README.length;
  return README.slice(start, end);
}

/** 清单条目：形如 `- \`npm run xxx\` —— ...` */
function listedScripts(section = gateSection()): string[] {
  return [...section.matchAll(/^- `npm run ([a-z][a-z0-9:_-]*)`/gm)].map((m) => m[1]);
}

/**
 * 钩子**实际执行**的脚本名。
 *
 * 必须排除注释行：钩子的头部注释里写了一句「build 更慢…留给显式调用
 * npm run check」，若连注释一起扫，会把 check 当成门禁的一部分 ——
 * 实测因此误报「钩子跑了 check 但 README 没列」。
 */
function hookScripts(): string[] {
  const found: string[] = [];
  for (const raw of HOOK.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("#")) continue; // 注释
    if (line.startsWith("echo")) continue; // 仅用于回显的提示文案
    // 匹配 `npm run --silent <name>` 与 `npm run <name>`
    for (const m of line.matchAll(/npm run (?:--silent )?([a-z][a-z0-9:_-]*)/g)) {
      found.push(m[1]);
    }
  }
  return [...new Set(found)];
}

describe("README · 提交前门禁清单与钩子一致", () => {
  it("钩子里每个脚本都在 README 门禁清单里", () => {
    const listed = listedScripts();
    const scripts = hookScripts();
    expect(scripts.length, "没从钩子里解析出任何脚本，断言会空跑").toBeGreaterThan(0);
    expect(listed.length, "没从 README 解析出清单条目，断言会空跑").toBeGreaterThan(0);
    for (const name of scripts) {
      expect(
        listed,
        `钩子跑了 \`npm run ${name}\`，但 README 的门禁清单里没列 —— 读者会以为这一项不必管`,
      ).toContain(name);
    }
  });

  it("README 门禁清单里不该出现钩子没跑的脚本（避免列了却不执行）", () => {
    const scripts = new Set(hookScripts());
    const listed = listedScripts();
    expect(listed.length, "门禁清单一条都没解析到").toBeGreaterThan(0);
    for (const name of listed) {
      expect(
        scripts.has(name),
        `README 列了 \`npm run ${name}\` 是门禁的一部分，但钩子并不执行它`,
      ).toBe(true);
    }
  });

  it("lint 必须在清单里（P154 补进门禁后 README 曾漏写）", () => {
    expect(
      listedScripts(),
      "README 门禁清单又漏了 lint —— 这正是 P154 之后漏写过的那个条目",
    ).toContain("lint");
    expect(
      hookScripts(),
      "钩子不再跑 lint 了 —— 若是有意移除，请同步更新这条断言与 README",
    ).toContain("lint");
  });
});
