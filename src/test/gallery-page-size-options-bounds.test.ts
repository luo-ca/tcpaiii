import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FE = readFileSync(resolve(process.cwd(), "src/lib/constants.ts"), "utf8");
const BE = readFileSync(resolve(process.cwd(), "edge-functions-src/lib/types.ts"), "utf8");

/** 从源码取 `export const NAME = <number>;` */
function readNum(src: string, name: string): number | null {
  const m = src.match(new RegExp(`export const ${name}\\s*=\\s*(\\d[\\d_]*)\\s*;`));
  return m ? Number(m[1].replace(/_/g, "")) : null;
}

/** 取 `export const NAME = [12, 24, 48] as const;` 里的数值列表 */
function readNumList(src: string, name: string): number[] | null {
  const m = src.match(new RegExp(`export const ${name}\\s*=\\s*\\[([^\\]]*)\\]`));
  if (!m) return null;
  return m[1]
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

/**
 * 后台/图库的「每页张数」下拉项必须全部落在服务端上限之内。
 *
 * 服务端的 normalizePositiveInt(value, fallback, max) 是**静默夹取**（silently clamp），
 * 不是报错：请求 pageSize=100 而 MAX_LIST_PAGE_SIZE=60 时，服务端照 60 返回，
 * 客户端却以为自己要了 100 —— 用户在下拉里选了「100」，实际拿到 60，界面上
 * 「每页 N 张」与真实返回条数对不上，而且这条分歧不产生任何错误提示。
 *
 * 与 PAIRS 那几对不同：这里前端是**列表**、后端是**标量上限**，不是等值关系，
 * 因此没法直接用值比对表达，需要单独一条「上限包含」断言。
 */
describe("每页张数下拉项必须落在服务端 MAX_LIST_PAGE_SIZE 之内", () => {
  it("两侧常量都能解析出来（防改名后空跑）", () => {
    expect(readNumList(FE, "GALLERY_PAGE_SIZE_OPTIONS"), "前端缺 GALLERY_PAGE_SIZE_OPTIONS").not.toBeNull();
    expect(readNum(BE, "MAX_LIST_PAGE_SIZE"), "后端缺 MAX_LIST_PAGE_SIZE").not.toBeNull();
  });

  it("每个下拉项都不超过服务端上限（超出会被静默夹取，界面与真实条数分歧）", () => {
    const options = readNumList(FE, "GALLERY_PAGE_SIZE_OPTIONS")!;
    const max = readNum(BE, "MAX_LIST_PAGE_SIZE")!;
    expect(options.length, "下拉项为空").toBeGreaterThan(0);
    for (const option of options) {
      expect(
        option,
        `下拉项 ${option} 超过服务端上限 ${max}：服务端会静默夹到 ${max}，` +
          `用户选了 ${option} 却只拿到 ${max} 条，且无任何报错`,
      ).toBeLessThanOrEqual(max);
    }
  });

  it("默认每页张数也必须落在上限内", () => {
    const def = readNum(FE, "GALLERY_PAGE_SIZE")!;
    const max = readNum(BE, "MAX_LIST_PAGE_SIZE")!;
    expect(def).toBeLessThanOrEqual(max);
  });
});
