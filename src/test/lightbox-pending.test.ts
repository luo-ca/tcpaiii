import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 灯箱「下一页占位态」的一致性契约（P56）。
 *
 * 索引可以临时等于 images.length —— 那是「已请求下一页、数据还在路上」的
 * 占位态（gallery-browse 的 navigateLightbox 走到末尾会 fetchNextPage 并
 * 把索引推到位）。此时 image 为 undefined，灯箱显示「正在加载下一张…」。
 *
 * 原先有两处会跟这个加载态打架：
 *  1. DialogTitle 把索引夹成 min(index+1, images.length)，读屏听到
 *     「第 N 张，共 N 张」——像是已经到底了，与可见的加载态相反；
 *  2. 可见计数同样夹取，显示「N / N」，同一屏里「N/N」和「正在加载下一张…」
 *     两句话互相打脸。
 * 修法：占位态下标题明说「正在加载下一张」，计数条整体不渲染。
 */

const SOURCE = readFileSync(
  resolve(process.cwd(), "src/components/ui/image-lightbox.tsx"),
  "utf8",
);

describe("灯箱占位态：标题不得谎称已到底", () => {
  it("占位态标题显式播报「正在加载下一张」", () => {
    expect(SOURCE).toContain("正在加载下一张（已显示");
    // 标题分支必须挂在 isPendingNext 上
    const titleBlock = SOURCE.slice(
      SOURCE.indexOf("<DialogTitle"),
      SOURCE.indexOf("</DialogTitle>"),
    );
    expect(titleBlock).toMatch(/isPendingNext/);
    expect(titleBlock).toContain("正在加载下一张");
  });

  it("标题不再用 Math.min 夹取索引（那正是「假装到底」的来源）", () => {
    const titleBlock = SOURCE.slice(
      SOURCE.indexOf("<DialogTitle"),
      SOURCE.indexOf("</DialogTitle>"),
    );
    expect(titleBlock).not.toMatch(/Math\.min/);
    // 非占位态显示真实序号
    expect(titleBlock).toMatch(/index \+ 1/);
  });
});

describe("灯箱占位态：可见计数不得与加载态并存", () => {
  it("计数条整体挂在 !isPendingNext 上", () => {
    const counterStart = SOURCE.indexOf("sticker-chip absolute left-1/2");
    expect(counterStart).toBeGreaterThan(-1);
    // 往回收缩到该 JSX 块的条件表达式起点
    const condition = SOURCE.slice(
      SOURCE.lastIndexOf("{index !== null", counterStart),
      counterStart,
    );
    expect(condition).toContain("!isPendingNext");
  });

  it("计数不再夹取索引，直接展示真实序号", () => {
    const counterBlock = SOURCE.slice(
      SOURCE.lastIndexOf("{index !== null", SOURCE.indexOf("sticker-chip absolute left-1/2")),
      SOURCE.indexOf("</span>", SOURCE.indexOf("sticker-chip absolute left-1/2")),
    );
    expect(counterBlock).not.toMatch(/Math\.min/);
    expect(counterBlock).toMatch(/index \+ 1\} \/ \{images\.length\}/);
  });
});
