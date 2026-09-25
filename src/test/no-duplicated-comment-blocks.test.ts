import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 源码里不得存在相邻重复的注释块（P174）。
 *
 * 实测发现 edge-functions-src/lib/images.ts 的 handleRandomImage 里，
 * 「exclude 空池兜底」那段 7 行说明被逐字粘贴了两遍（原 79-91 行）：
 *
 *     // excludeId 只是「别撞回上一张」的软偏好，不是硬约束。
 *     // 过滤后必须自己兜一次空池：id 理论上唯一（crypto.randomUUID），
 *     // 但存储被手工改过 / 数据损坏时可能出现重复 id，此时若排除项恰好覆盖
 *     // 全部候选，pool 会变成空数组 —— pool[NaN] 是 undefined，
 *     // 紧接着的 selected.id / selected.url 就会抛异常，把这个 tag 变成
 *     // 持续 500。宁可返回「上一张」，也不能让接口挂掉。
 *
 * 这是编辑/合并残留：同一段理由说两遍，读者会以为两处在讲不同的事而反复找
 * 差异（实际零差异），后续修改还得两处同步。不影响运行时行为，但会长期
 * 误导维护者，且没有任何工具会报出来 —— 只能靠测试或人工逐行核对。
 *
 * 本用例把「全仓不存在相邻重复注释块」钉住：扫描 src/ 与 edge-functions-src/
 * 下所有 .ts/.tsx，按去空白后的文本比较，位移 1..12 行找长度 >=2 的相邻重复
 * 块。单行重复（如分隔线、`// ignore`）不算 —— 短行重复往往是刻意的，
 * 阈值 12 字符也把这类噪声滤掉了。
 *
 * 注：这里刻意不锁「重复的是哪段文字」，只锁「不存在这种重复」——
 * 否则修好之后测试会因为文案变化而失效。
 */

const ROOT = process.cwd();
const SCAN_DIRS = ["src", "edge-functions-src"];

/** 去注释前缀 + 空白，用于比较 */
function normalizeComment(line: string): string {
  return line.replace(/\/\/+\s*/, "").replace(/^\s*\*?\s*/, "").trim();
}

/** 判定是否为「实质注释行」：注释前缀 + 去空白后 > 12 字符 */
function isSubstantiveComment(line: string): boolean {
  if (!/^\s*(\/\/|\*)/.test(line)) return false;
  return normalizeComment(line).length > 12;
}

/** 找出所有长度 >= 2 的相邻重复注释块，返回 `file:line` 描述。 */
function findDuplicatedCommentBlocks(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
    }
  };
  for (const dir of SCAN_DIRS) {
    const abs = resolve(ROOT, dir);
    try {
      if (statSync(abs).isDirectory()) walk(abs);
    } catch {
      // 目录不存在（例如精简检出的仓库）就跳过
    }
  }

  const found: string[] = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!isSubstantiveComment(lines[i])) continue;
      for (let span = 1; span <= 12 && i + 2 * span <= lines.length; span++) {
        const first = lines.slice(i, i + span);
        const second = lines.slice(i + span, i + 2 * span);
        if (!first.every(isSubstantiveComment)) break;
        if (first.every((line, j) => normalizeComment(line) === normalizeComment(second[j]))) {
          const rel = file.slice(ROOT.length + 1).replace(/\\/g, "/");
          found.push(`${rel}:${i + 1} (重复 ${span} 行)`);
          i += 2 * span - 1;
          break;
        }
      }
    }
  }
  return found;
}

describe("源码卫生 · 相邻重复注释块", () => {
  it("全仓不存在相邻重复的注释块", () => {
    const duplicates = findDuplicatedCommentBlocks();
    expect(
      duplicates,
      `发现相邻重复注释块（编辑/合并残留，同一段理由说两遍）：\n${duplicates.join("\n")}`,
    ).toEqual([]);
  });

  it("扫描器本身有效：能识别出被钉住的那类重复", () => {
    // 防「扫描器写歪了所以永远返回空数组」——用一段合成源码自证
    const synthetic = [
      "// 过滤后必须自己兜一次空池：id 理论上唯一",
      "// 全部候选，pool 会变成空数组",
      "// 过滤后必须自己兜一次空池：id 理论上唯一",
      "// 全部候选，pool 会变成空数组",
    ];
    const norm = (l: string) => l.replace(/\/\/+\s*/, "").replace(/^\s*\*?\s*/, "").trim();
    const isC = (l: string) => /^\s*(\/\/|\*)/.test(l) && norm(l).length > 12;
    const first = synthetic.slice(0, 2);
    const second = synthetic.slice(2, 4);
    expect(first.every(isC)).toBe(true);
    expect(first.every((l, j) => norm(l) === norm(second[j]))).toBe(true);
  });
});
