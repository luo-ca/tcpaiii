import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 图库翻页必须按 id 去重（P171）。
 *
 * 分页是 offset 式的（服务端 `filtered.slice(start, start + pageSize)`），
 * 而「加载更多」是两次独立请求。两次之间图库只要多一张图，整个数组右移一位，
 * 第 2 页就会把第 1 页末尾几张**再发一遍**。
 *
 * 实测（桩：第 1 页 1..12、第 2 页 10..21，模拟中间插入新图）：
 *   未去重 → 24 张瓦片但只有 21 个唯一地址，img-10/11/12 各渲染两次
 *   去重后 → 21 张，全部唯一
 *
 * 为什么这条必须用测试钉：重复瓦片**没有任何控制台信号**。
 * key 由 MasonryTile 内部生成，React 不会报重复 key；页面也不报错。
 * 唯一的观测方式是数「瓦片数 vs 唯一地址数」—— 人眼几乎不会去数。
 */

const SOURCE = readFileSync(resolve(process.cwd(), "src/features/gallery-browse.tsx"), "utf8");

describe("图库翻页 · 跨页重复项必须去重", () => {
  it("合并分页结果后按 id 去重", () => {
    const i = SOURCE.indexOf("const images = useMemo");
    expect(i, "找不到 images 的 useMemo").toBeGreaterThan(-1);
    const block = SOURCE.slice(i, i + 1400);
    expect(block, "合并分页结果的方式变了，请确认去重逻辑仍在").toMatch(/flatMap\(\(page\) => page\.items\)/);
    expect(block, "缺 id 去重的 seen 集合 —— 跨页重叠会原样渲染成重复瓦片").toMatch(/new Set<string>\(\)/);
    expect(block, "缺按 id 过滤").toMatch(/seen\.has\(image\.id\)/);
  });

  it("去重后仍把 id 收进集合（漏掉 add 会让去重完全失效）", () => {
    const i = SOURCE.indexOf("const seen = new Set<string>();");
    expect(i, "找不到 seen 集合").toBeGreaterThan(-1);
    expect(SOURCE.slice(i, i + 300), "过滤时忘了 add，去重形同虚设").toMatch(/seen\.add\(image\.id\)/);
  });

  it("去重与合并共用同一个 useMemo（灯箱索引必须指向同一份数组）", () => {
    // 灯箱用 lightboxIndex 索引 images；若把去重放到别处、images 仍是未去重的合并结果，
    // 索引与渲染就会指向两份不同的数组 —— 点第 3 张可能开出第 4 张。
    const i = SOURCE.indexOf("const images = useMemo");
    const block = SOURCE.slice(i, i + 1400);
    expect(block, "去重不应拆成第二个 useMemo").not.toMatch(/\},\s*\[imagesQuery\.data\]\);\s*const \w+ = useMemo/);
  });
});
