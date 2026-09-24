import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 前后端重复定义的数值常量必须同值（P152）。
 *
 * 后端不能 import 前端常量（Edge 函数独立编译），前端也不该 import 后端那份，
 * 所以这些值在两处各写一遍。此前**只有 STATS_TIME_ZONE 有一致性护栏**
 * （见 stats-timezone.test.ts），其余成对常量全靠人记得同步。
 *
 * 漂移的代价不是「报错」，而是**静默行为分裂**：
 *   · 前端 MAX_BATCH_IMAGE_COUNT 大于后端 MAX_BATCH_SIZE
 *     → 用户勾了 600 张、前端放行、服务端 400「单次批量数量超出上限」，
 *       而前端刚刚承诺过「最多 500」的那个界面上限形同虚设；
 *   · 前端 MAX_SEARCH_LENGTH > 后端 MAX_LIST_FILTER_LENGTH
 *     → 输入框允许打 150 字，服务端只按前 100 字筛 → 「搜了什么就筛什么」不成立；
 *   · 前端 MAX_TITLE_LENGTH < 后端 → 用户明明能存 120 字，界面却卡在 80；
 *   · 前端 MAX_IMAGE_URL_LENGTH > 后端 → 前端校验通过、服务端拒，报格式错误。
 *
 * 这条测试直接读两边的源码做逐值比对，任何一侧改了而另一侧没跟上就会红。
 */

const FE = readFileSync(resolve(process.cwd(), "src/lib/constants.ts"), "utf8");
const BE = readFileSync(resolve(process.cwd(), "edge-functions-src/lib/types.ts"), "utf8");

/** 从源码里取一个 `export const NAME = <number>;`（允许下划线分隔） */
function readConst(src: string, name: string): number | null {
  const re = new RegExp(`export const ${name}\\s*=\\s*(\\d[\\d_]*)\\s*;`);
  const m = src.match(re);
  return m ? Number(m[1].replace(/_/g, "")) : null;
}

/** 前端名 ↔ 后端名（名字不同但语义相同的成对常量） */
const PAIRS: Array<{ fe: string; be: string; why: string }> = [
  { fe: "MAX_TITLE_LENGTH", be: "MAX_TITLE_LENGTH", why: "标题上限：表单 maxLength 与入库截断同值" },
  { fe: "MAX_TAG_LENGTH", be: "MAX_TAG_LENGTH", why: "单个标签长度：输入框与 normalizeTags 同值" },
  { fe: "MAX_TAGS_PER_IMAGE", be: "MAX_TAGS_PER_IMAGE", why: "每图标签数：解析器封顶与入库封顶同值" },
  { fe: "MAX_IMAGE_URL_LENGTH", be: "MAX_IMAGE_URL_LENGTH", why: "URL 硬上限：前端拒的与后端拒的必须一致" },
  { fe: "MAX_BATCH_IMAGE_COUNT", be: "MAX_BATCH_SIZE", why: "批量上限：前端预检与后端硬限同值（P144 依赖它）" },
  { fe: "MAX_SEARCH_LENGTH", be: "MAX_LIST_FILTER_LENGTH", why: "搜索词上限：输入框 maxLength 与服务端截断同值" },
];

describe("前后端常量一致性（P152）", () => {
  it("两边都能解析出常量（防止改名后这条测试空跑）", () => {
    for (const { fe, be } of PAIRS) {
      expect(readConst(FE, fe), `前端缺 ${fe}`).not.toBeNull();
      expect(readConst(BE, be), `后端缺 ${be}`).not.toBeNull();
    }
  });

  it.each(PAIRS)("$fe == $be（$why）", ({ fe, be, why }) => {
    const f = readConst(FE, fe);
    const b = readConst(BE, be);
    expect(f, `${fe} 与 ${be} 漂移了：前端 ${f}、后端 ${b} —— ${why}`).toBe(b);
  });

  it("批量上限的双名映射写进了注释，避免下次改了一侧找不到另一侧", () => {
    // 前端用 MAX_BATCH_IMAGE_COUNT、后端用 MAX_BATCH_SIZE，
    // 名字不同最容易漏改。注释里点明对应关系。
    expect(
      FE,
      "前端 MAX_BATCH_IMAGE_COUNT 缺与后端 MAX_BATCH_SIZE 的对应说明",
    ).toMatch(/MAX_BATCH_SIZE/);
  });
});