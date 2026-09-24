import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 灯箱「翻到末尾续加载失败」必须有出路（P111）。
 *
 * 图库翻到第 24 张（本页末尾）再按「下一张」时，灯箱会把索引推到
 * images.length 作为占位，并触发 fetchNextPage。若这一页请求失败：
 *
 *   · hasNextPage 在失败后**仍为 true**（react-query 保留上一页的该字段），
 *     于是「越界就把灯箱收起」的那条兜底不会触发；
 *   · 灯箱又没有失败态，只有「正在加载下一张…」。
 *
 * 结果就是**永久卡在加载中**。用真实构建产物 + 一个「第 1 页正常、第 2 页
 * 恒 500」的桩实测：点「下一张」后 2.5 秒，弹窗里仍是
 *   「正在加载下一张（已显示 24 张） | 正在加载下一张… | 关闭」
 * 没有任何失败提示或重试入口，用户只能关掉弹窗。
 *
 * 修法：把 isFetchNextPageError 透传给灯箱，失败时改渲染「下一张加载失败 +
 * 重试」；读屏标题也从「正在加载」改成「加载失败」，避免与视觉状态矛盾。
 */

const lightbox = readFileSync(
  resolve(process.cwd(), "src/components/ui/image-lightbox.tsx"),
  "utf8",
);
const browse = readFileSync(
  resolve(process.cwd(), "src/features/gallery-browse.tsx"),
  "utf8",
);

describe("灯箱 · 续加载失败有明确出路", () => {
  it("灯箱接收失败标记与重试回调", () => {
    expect(lightbox, "缺 nextFailed prop").toContain("nextFailed");
    expect(lightbox, "缺 onRetryNext prop").toContain("onRetryNext");
  });

  it("失败时渲染失败态与重试按钮，而不是继续转圈", () => {
    expect(lightbox, "缺失败文案").toContain("下一张加载失败");
    // 失败态必须拦在加载态之前（isPendingNext && nextFailed）
    expect(lightbox, "失败态未与占位态区分").toMatch(/isPendingNext && nextFailed/);
    // 加载态在失败时不再渲染
    expect(lightbox, "加载态未排除失败情形").toMatch(/isPendingNext && !nextFailed/);
    // 重试入口
    expect(lightbox, "缺重试按钮").toMatch(/onRetryNext/);
  });

  it("读屏标题与视觉状态一致（失败时不再播报「正在加载」）", () => {
    const i = lightbox.indexOf("<DialogTitle");
    const block = lightbox.slice(i, lightbox.indexOf("</DialogTitle>", i));
    expect(block, "标题未反映失败态").toContain("下一张加载失败");
    expect(block, "标题未按 nextFailed 分支").toMatch(/nextFailed/);
  });

  it("gallery-browse 把 isFetchNextPageError 接上", () => {
    expect(browse, "未读取 isFetchNextPageError").toContain("isFetchNextPageError");
    expect(browse, "未把失败状态传给灯箱").toMatch(/nextFailed=\{/);
    expect(browse, "未提供重试回调").toMatch(/onRetryNext=\{/);
  });
});
