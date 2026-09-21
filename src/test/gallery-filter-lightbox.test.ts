import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 图库筛选变化必须作废灯箱索引（P57）。
 *
 * `useInfiniteQuery` 用了 `placeholderData: keepPreviousData`：切标签/搜索的
 * 瞬间，旧一批结果会继续留在 `images` 里，旧索引因此仍然「合法」，灯箱不会
 * 自动关闭。等新数据到达，同一个索引就指向了另一张图（或直接越界）——用户
 * 视角是「切了个标签，大图莫名换了张」。
 *
 * 索引的语义只对「当前这份结果集」成立；结果集一换，索引就该作废。因此必须
 * 有一个副作用：监听筛选条件（selectedTag / searchQuery）变化，收起灯箱。
 */

const SOURCE = readFileSync(
  resolve(process.cwd(), "src/features/gallery-browse.tsx"),
  "utf8",
);

/** 提取源码里所有 `useEffect(...)` 调用（按括号配平取整块）。 */
function extractUseEffects(source: string): string[] {
  const blocks: string[] = [];
  let cursor = source.indexOf("useEffect(");
  while (cursor !== -1) {
    let depth = 0;
    let end = cursor + "useEffect".length; // 指向 '('
    for (; end < source.length; end++) {
      const ch = source[end];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) {
          end++;
          break;
        }
      }
    }
    blocks.push(source.slice(cursor, end));
    cursor = source.indexOf("useEffect(", end);
  }
  return blocks;
}

const effects = extractUseEffects(SOURCE);

/**
 * 筛选变化副作用。注意：依赖数组含 selectedTag + searchQuery 的副作用有两个 ——
 * 一个是「把筛选回写地址栏」，另一个才是「收起灯箱」。必须按函数体区分：
 * 这里锁定「体内调用 setLightboxIndex」的那个。
 */
function filterResetEffect(): string {
  return (
    effects.find((block) => {
      const open = block.lastIndexOf("[");
      const close = block.lastIndexOf("]");
      if (open === -1 || close <= open) return false;
      const deps = block.slice(open, close + 1);
      if (!/selectedTag/.test(deps) || !/searchQuery/.test(deps)) return false;
      // 排除「回写地址栏」那个副作用：它以 history.replaceState 为特征
      if (/replaceState/.test(block)) return false;
      return /setLightboxIndex/.test(block);
    }) ?? ""
  );
}

describe("图库筛选变化：灯箱索引必须作废", () => {
  it("存在监听 selectedTag + searchQuery 的副作用", () => {
    expect(filterResetEffect(), "未找到筛选变化副作用").not.toBe("");
  });

  it("该副作用把灯箱索引置空", () => {
    const block = filterResetEffect();
    expect(block).toMatch(/setLightboxIndex\(\s*null\s*\)/);
  });

  it("筛选副作用不能顺带清空搜索框本身（否则输入框会自己清空）", () => {
    const block = filterResetEffect();
    expect(block).not.toMatch(/setSearchTerm/);
    expect(block).not.toMatch(/setSelectedTag/);
  });
});
