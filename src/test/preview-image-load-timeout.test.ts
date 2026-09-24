import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 首页随机图预览：加载状态必须有兜底出口（P135）。
 *
 * `imageLoading` 只在两处被关掉：<img> 的 onLoad 与 onError。但有一类情况
 * 两个都不会触发 —— 响应是 200 却被中间层静默截断、0 字节响应、解码挂起。
 * 此时那层 skeleton-shimmer 会永久盖在图上，用户卡在「加载中」；更糟的是
 * 刷新按钮写的是 disabled={imageLoading}，于是**连重试都点不了**，
 * 整个预览区块只能靠刷新整页才能恢复。
 *
 * 修法：加一个 20s 兜底计时器，超时即判定失败、交出控制权
 * （错误面板自带「重试」按钮）。计时器必须挂在 [imageLoading, imageKey] 上：
 * 每次换图（imageKey 递增）都要重新计时，否则连续换图会被上一张的计时器误杀。
 */

const src = readFileSync(
  resolve(process.cwd(), "src/components/sections/OnlinePreview.tsx"),
  "utf8",
);

describe("首页预览 · 加载中超时有出口", () => {
  it("存在超时常量", () => {
    expect(src, "缺加载超时常量").toMatch(/const IMAGE_LOAD_TIMEOUT_MS = \d/);
  });

  it("超时后关掉 imageLoading 并给出可重试的错误态", () => {
    const i = src.indexOf("useEffect(() => {", src.indexOf("const handleImageError"));
    expect(i, "未找到兜底 useEffect").toBeGreaterThan(-1);
    const block = src.slice(i, i + 700);
    expect(block, "未挂载计时器").toContain("setTimeout");
    expect(block, "超时未关掉加载态").toContain("setImageLoading(false)");
    expect(block, "超时未置错误态，用户看不到重试入口").toContain("setPreviewError(");
    expect(block, "计时器未清理，换图后会残留").toContain("clearTimeout");
  });

  it("计时器依赖 imageLoading 与 imageKey（连续换图需重新计时）", () => {
    const i = src.indexOf("useEffect(() => {", src.indexOf("const handleImageError"));
    const block = src.slice(i, i + 700);
    const deps = block.slice(block.lastIndexOf("["));
    expect(deps).toContain("imageLoading");
    expect(deps).toContain("imageKey");
  });

  it("加载中时不挂计时器（不该无谓地起定时器）", () => {
    const i = src.indexOf("useEffect(() => {", src.indexOf("const handleImageError"));
    const block = src.slice(i, i + 700);
    expect(block, "缺 imageLoading 早退守卫").toMatch(
      /if\s*\(\s*!imageLoading\s*\)\s*return\s*;/,
    );
  });

  it("刷新按钮仍由 imageLoading 禁用（兜底后自动解禁）", () => {
    expect(src).toMatch(/disabled=\{imageLoading\}/);
  });
});
