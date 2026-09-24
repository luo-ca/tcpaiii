import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 「加载更多」失败不得抹掉已渲染的图（P112）。
 *
 * 图库用的是 useInfiniteQuery。续加载（fetchNextPage）失败时，
 * `isError` **同样会变成 true** —— 而原先的渲染分支写的是
 * `imagesQuery.isError ? <ErrorState/>`，于是整块网格被错误卡替换。
 *
 * 用真实构建产物 + 一个「第 1 页正常（24 张、hasNextPage）、第 2 页恒 500」
 * 的桩实测：
 *
 *   修复前：点「加载更多」→ 瓦片数 24 → **0**，页面显示
 *           「图库加载失败 / 模拟下一页加载失败 / 重新加载」
 *           —— 用户刚看的那 24 张全没了，只能整页重来。
 *   修复后：瓦片数保持 **24**，仅在「加载更多」旁就地提示
 *           「加载更多失败：…」，网格与滚动位置都不动。
 *
 * 修法：整块错误态只服务首屏（isError && 无数据），续加载失败就地提示。
 */

const src = readFileSync(
  resolve(process.cwd(), "src/features/gallery-browse.tsx"),
  "utf8",
);

describe("图库 · 续加载失败不抹掉已加载内容", () => {
  it("有 isInitialError 判定（首屏失败才整块报错）", () => {
    expect(src, "缺 isInitialError：续加载失败会整块切错误态").toContain("isInitialError");
    expect(src, "判定未排除「已有数据」的情况").toMatch(
      /isInitialError\s*=\s*imagesQuery\.isError\s*&&\s*images\.length\s*===\s*0/,
    );
  });

  it("整块错误分支用的是 isInitialError，而不是全量的 isError", () => {
    expect(src, "整块错误态仍在用 isError：加载更多失败会清空网格").toMatch(
      /\)\s*:\s*isInitialError\s*\?\s*\(/,
    );
    expect(
      src,
      "不应再出现 `: imagesQuery.isError ? (` 这种全量判定",
    ).not.toMatch(/:\s*imagesQuery\.isError\s*\?\s*\(/);
  });

  it("续加载失败在「加载更多」附近就地提示", () => {
    expect(src, "缺就地失败提示").toContain("加载更多失败");
    // 提示必须是 role=alert，读屏才会播报
    const i = src.indexOf("加载更多失败");
    const around = src.slice(Math.max(0, i - 260), i + 80);
    expect(around, "失败提示缺 role=alert").toContain('role="alert"');
    expect(around, "失败提示未挂在 nextPageFailed 上").toMatch(/nextPageFailed/);
  });
});
