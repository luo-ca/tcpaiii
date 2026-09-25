import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 后台「图库为空」必须是真为空，不能拿筛选后的数量冒充（P175）。
 *
 * 原先判据是 `totalImages === 0`，而 totalImages 在 stats 未到达时会回退到
 * `imagesQuery.data.total` —— 那是**当前筛选结果**的数量。
 *
 * 实测（桩：/api/stats 恒 500，库内 48 张；输入一个搜不到的词）：
 *   修复前 → 「图片库还是空的 / 添加第一张图片，开始建设你的共享图库」+ 添加按钮
 *           把「筛选无结果」谎报成「图库为空」，管理员很可能以为数据丢了
 *   修复后 → 「没有找到匹配的图片 / 换个关键词试试，或者清空当前筛选条件」+ 清空筛选
 *
 * stats 是唯一知道全库总数的来源，所以只有它成功返回时才允许判空库；
 * 它拿不到就宁可不显示空库态 —— 少一个提示好过给一个错的。
 */

const SOURCE = readFileSync(resolve(process.cwd(), "src/features/admin-page.tsx"), "utf8");

describe("后台空态 · 空库判定不得被筛选污染", () => {
  it("空库判据必须门控在 stats 成功之上", () => {
    const i = SOURCE.indexOf("const isGalleryEmpty");
    expect(i, "找不到 isGalleryEmpty").toBeGreaterThan(-1);
    const decl = SOURCE.slice(i, SOURCE.indexOf(";", i) + 1);
    expect(
      decl,
      "isGalleryEmpty 不再看 statsLoaded —— stats 拿不到时会回退到筛选后的数量，把「无匹配」谎报成「空库」",
    ).toMatch(/statsLoaded/);
    expect(decl, "空库判据应基于全库总数 totalImages").toMatch(/totalImages/);
  });

  it("stats 不可用时的兜底必须排除「正在筛选」的情形", () => {
    const i = SOURCE.indexOf("const isGalleryEmpty");
    // 兜底分支里必须出现 hasActiveFilter —— 否则筛选态下仍会误判空库
    expect(
      SOURCE.slice(i, i + 700),
      "兜底分支没排除筛选态：有筛选 + stats 失败时仍会显示「图库还是空的」",
    ).toMatch(/hasActiveFilter/);
  });

  it("空库 EmptyState 用的是 isGalleryEmpty，不是裸的 totalImages === 0", () => {
    const i = SOURCE.indexOf('title="图片库还是空的"');
    expect(i, "找不到空库 EmptyState").toBeGreaterThan(-1);
    // 往上找最近的 { ... && ( 条件行
    const before = SOURCE.slice(Math.max(0, i - 500), i);
    expect(
      before,
      "空库分支又用回了 totalImages === 0 —— 正是被筛选污染的那个判据",
    ).toMatch(/isGalleryEmpty && \(/);
    expect(before, "空库分支不应直接比较 totalImages").not.toMatch(/\{totalImages === 0 && \(/);
  });

  it("hasActiveFilter 覆盖标签与搜索两种筛选", () => {
    const i = SOURCE.indexOf("const hasActiveFilter");
    expect(i, "找不到 hasActiveFilter").toBeGreaterThan(-1);
    const decl = SOURCE.slice(i, i + 160);
    expect(decl, "hasActiveFilter 漏了标签筛选").toMatch(/selectedTag/);
    expect(decl, "hasActiveFilter 漏了搜索筛选").toMatch(/searchQuery/);
  });

  it("真·空库仍要显示空态（P175 不得改过头，把空库也一起吞掉）", () => {
    // stats 成功且全库为 0 时必须判空库 —— 否则「图库还是空的 + 添加第一张」的引导
    // 永远不出现，新管理员面对一片空白且找不到入口。
    // 实测（桩：stats 成功、totalImages=0、list 返回 0 条）→ 显示「图片库还是空的」。
    const i = SOURCE.indexOf("const isGalleryEmpty");
    const decl = SOURCE.slice(i, i + 400);
    expect(
      decl,
      "stats 成功分支必须用 stats.totalImages 判 0 —— 否则真·空库不会被识别",
    ).toMatch(/stats\?\.totalImages \?\? 0\) === 0/);
    expect(
      SOURCE,
      "空库 EmptyState 被删掉了：新管理员看不到任何引导",
    ).toContain('title="图片库还是空的"');
  });
});
