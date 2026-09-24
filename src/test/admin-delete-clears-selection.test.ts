import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 删除图片后必须把这批选择里的对应 id 摘掉（P145）。
 *
 * 场景：用户在「批量改标签」模式下勾了若干张，其中一张被删掉。
 *
 * 现状（实测代码路径）：
 *   · deleteMutation.onSuccess → refreshGallery() 只作废 query，不碰 selectedIds
 *   · 被删的 id 仍留在 selectedIds 里
 *   · 「已选 N 张」把这张已不存在的图算进去
 *   · 点「应用到 N 张」把这个 id 一起提交
 *
 * 后果：服务端对不存在的 id 返回 'Image not found'，batchUpdateImageTags 的
 * failed 计数 +1 → toast 报「1 张图片未命中（可能刚被删除）」。
 * 用户视角是「我明明把它删了，怎么还说没命中」—— 一个由客户端状态残留
 * 制造的假失败。
 *
 * 修法：删除成功后按 id 从 selectedIds 里摘掉（不是整体清空 —— 用户其它
 * 勾选仍然有效，不该因为删了一张就丢掉整批选择）。
 */

const PAGE = readFileSync(resolve(process.cwd(), "src/features/admin-page.tsx"), "utf8");

function deleteBlock(): string {
  const start = PAGE.indexOf("deleteMutation = useMutation");
  const end = PAGE.indexOf("deleteImageById");
  expect(start, "找不到 deleteMutation").toBeGreaterThan(-1);
  expect(end, "找不到 deleteImageById").toBeGreaterThan(start);
  return PAGE.slice(start, end);
}

describe("admin 删除 · 清理残留选择（P145）", () => {
  it("删除成功后从 selectedIds 里摘掉该 id", () => {
    const block = deleteBlock();
    expect(
      block,
      "onSuccess 未清理 selectedIds：被删的图仍会算进「已选 N 张」并提交给服务端",
    ).toMatch(/setSelectedIds/);
  });

  it("清理是按 id 摘除，不是整体清空（否则删一张会丢掉整批勾选）", () => {
    const block = deleteBlock();
    expect(block, "不该用 new Set() 整体清空").not.toMatch(/setSelectedIds\(new Set\(\)\)/);
    expect(block, "应按 id 过滤").toMatch(/delete\(id\)|filter\(/);
  });

  it("mutationFn 能拿到被删的 id 供 onSuccess 使用", () => {
    const block = deleteBlock();
    // onSuccess 的入参或 variables 要能定位到刚删的 id
    expect(block).toMatch(/onSuccess[\s\S]{0,220}(variables|id)/);
  });
});