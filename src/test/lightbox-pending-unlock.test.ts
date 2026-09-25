import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 灯箱「下一张」占位态必须有解除条件（P172）。
 *
 * P171 给分页合并加了按 id 去重。去重本身是对的，但它和原先的越界判据叠加后
 * 产生了一个死锁：原先只要「索引越界 && hasNextPage」就保留占位，等数据变长
 * 自然解除。可是去重之后，**一页可能一个新增都没有**（offset 分页在两次请求之间
 * 被插入/删除图片时，后面某一页可能整页都是已经见过的项），长度不变而
 * hasNextPage 仍为 true —— 占位态永远解除不了。
 *
 * 实测（桩：每页都返回同一批 6 张、hasNextPage 恒 true）：
 *   修复前：连按 8 次「下一张」→ 弹窗停在「正在加载下一张（已显示 6 张）」，瓦片数恒为 6，只能手动关
 *   修复后：同样的操作 → 稳定停在「图片 6（第 6 张，共 6 张）」
 *
 * 同时确认没有把正常续加载改坏（ok 桩，每页 24 张）：
 *   走到第 24 张再按一次 → 瓦片 24 → 48，灯箱显示「图片 25（第 25 张，共 48 张）」
 */

const SOURCE = readFileSync(resolve(process.cwd(), "src/features/gallery-browse.tsx"), "utf8");

describe("灯箱 · 越界占位态不得死锁", () => {
  const effectStart = SOURCE.indexOf("  // 灯箱索引越界处理。");
  const effectEnd = SOURCE.indexOf("const isFetchingNextPage = imagesQuery.isFetchingNextPage;");

  it("找得到越界处理的 effect", () => {
    expect(effectStart, "找不到越界处理注释锚点").toBeGreaterThan(-1);
    expect(effectEnd, "找不到 effect 结束锚点").toBeGreaterThan(effectStart);
  });

  it("保留占位的判定必须把「在拉 / 失败」作为前提（而非只看 hasNextPage）", () => {
    const block = SOURCE.slice(effectStart, effectEnd);
    // 关键：判定必须是一个以 hasNextPage 起头的合取，且同一表达式里带上
    // isFetchingNextPage / nextPageFailed。只在这些词恰好出现在依赖数组里时
    // 不该通过 —— 所以把匹配范围收进「awaitingNextPage = ...」这一段赋值语句。
    const assignStart = block.indexOf("awaitingNextPage =");
    expect(assignStart, "找不到 awaitingNextPage 赋值 —— 越界判定可能退化成了裸 hasNextPage 判断").toBeGreaterThan(-1);
    const assignEnd = block.indexOf(";", assignStart);
    const isFetchingIdx = block.indexOf("imagesQuery.isFetchingNextPage", assignStart);
    const nextFailedIdx = block.indexOf("nextPageFailed", assignStart);
    expect(
      isFetchingIdx > assignStart && isFetchingIdx < assignEnd,
      "awaitingNextPage 的条件里没带 isFetchingNextPage —— 去重后整页无新增时会永久卡在「正在加载下一张」",
    ).toBe(true);
    expect(
      nextFailedIdx > assignStart && nextFailedIdx < assignEnd,
      "awaitingNextPage 的条件里没带 nextPageFailed —— 失败重试 UI 会被回退逻辑顶掉",
    ).toBe(true);
    // 判定不能退化成裸的「越界 && hasNextPage」
    const cond = block.slice(assignStart, assignEnd);
    expect(
      cond,
      "awaitingNextPage 退化成「越界 && hasNextPage」了：这正是死锁的判据",
    ).not.toMatch(/^awaitingNextPage\s*=\s*$[\s\S]*hasNextPage\s*&&\s*lightboxIndex/);
  });

  it("有解除路径：不在拉且长度非零时回退到最后一张", () => {
    const block = SOURCE.slice(effectStart, effectEnd);
    expect(
      block,
      "缺回退到 images.length - 1 的分支 —— 越界态没有别的出路",
    ).toMatch(/setLightboxIndex\(images\.length - 1\)/);
  });

  it("依赖数组带上 isFetchingNextPage（漏掉会让 effect 不随请求结束重跑）", () => {
    const block = SOURCE.slice(effectStart, effectEnd);
    const deps = block.slice(block.lastIndexOf("}, ["));
    expect(
      deps,
      "effect 依赖里缺 isFetchingNextPage，请求结束后不会重新判定，占位态仍会卡住",
    ).toContain("imagesQuery.isFetchingNextPage");
  });

  it("连按「下一张」不重复发请求（防放大器）", () => {
    const navStart = SOURCE.indexOf("const navigateLightbox = useCallback");
    const navEnd = SOURCE.indexOf("const clearFilters");
    const nav = SOURCE.slice(navStart, navEnd);
    expect(
      nav,
      "navigateLightbox 未防重入：连按右键会为同一个 pageParam 连发请求",
    ).toMatch(/if \(!isFetchingNextPage\) void fetchNextPage\(\)/);
  });
});
