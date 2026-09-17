import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 后台图库分页：服务端回写的页码不得覆盖「占位数据」。
 *
 * 背景：`useQuery` 用了 `placeholderData: (prev) => prev`，翻页时旧页数据会
 * 作为占位值留在 `data` 里（`isPlaceholderData === true`），此时 `data.page`
 * 仍是**上一页**的页码。而末尾那个同步副作用原本无条件地
 *   data.page !== page  ->  setPage(data.page)
 * 于是刚点「下一页 / 跳页 / 末页」，页码立刻被弹回上一页 —— 表现为「翻页无效」。
 * 已用真实 @tanstack/query-core 复现：切到未缓存的新页时
 * `getOptimisticResult().data.page` 返回旧页号且 `isPlaceholderData === true`。
 *
 * 正确做法：该副作用在 `isPlaceholderData` 为真时直接跳过，只有拿到
 * 「本次请求」的真实数据才对齐页码。本测试把这条契约钉死。
 */

const SOURCE = readFileSync(
  resolve(process.cwd(), "src/features/admin-page.tsx"),
  "utf8",
);

/** 提取源码里所有 `useEffect(...)` 调用（含依赖数组）。 */
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

const pageSyncEffects = extractUseEffects(SOURCE).filter((block) =>
  /setPage\(\s*imagesQuery\.data\.page\s*\)/.test(block),
);

describe("后台分页：占位数据不得回写页码", () => {
  it("存在唯一一处「按服务端返回页码对齐」的副作用", () => {
    expect(pageSyncEffects).toHaveLength(1);
  });

  it("该副作用在 isPlaceholderData 为真时必须提前返回", () => {
    const block = pageSyncEffects[0] ?? "";
    expect(block).toMatch(
      /if\s*\(\s*imagesQuery\.isPlaceholderData\s*\)\s*return\s*;/,
    );
    // 守卫必须出现在回写之前，否则只是摆设。
    expect(block.indexOf("imagesQuery.isPlaceholderData")).toBeGreaterThan(-1);
    expect(block.indexOf("imagesQuery.isPlaceholderData")).toBeLessThan(
      block.indexOf("setPage(imagesQuery.data.page)"),
    );
  });

  it("依赖数组包含 isPlaceholderData，占位态变化能触发重跑", () => {
    const block = pageSyncEffects[0] ?? "";
    const openBracket = block.lastIndexOf("[");
    const closeBracket = block.lastIndexOf("]");
    expect(openBracket).toBeGreaterThan(-1);
    expect(closeBracket).toBeGreaterThan(openBracket);
    const deps = block.slice(openBracket, closeBracket + 1);
    expect(deps).toMatch(/imagesQuery\.isPlaceholderData/);
  });
});
