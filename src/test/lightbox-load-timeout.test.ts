import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 灯箱原图加载必须有超时出口（P136）。
 *
 * `status` 只由 <img> 的 onLoad / onError 推动。若响应是 200 却不触发这两个
 * 事件（被中间层静默截断、0 字节、解码挂起），灯箱会永远停在转圈的加载态：
 * 图片 opacity-0 不可见、下面没有任何按钮 —— 用户除了关掉弹窗别无出路。
 * 而错误态本是有退路的（「在新标签页打开」）。
 *
 * 修法：加 20s 兜底计时器，超时置 error，让已有那条出路显形。
 * 计时器必须随 image?.id 重置：翻到下一张要重新计时，否则新图会被上一张的
 * 计时器秒杀掉。
 */

const src = readFileSync(
  resolve(process.cwd(), "src/components/ui/image-lightbox.tsx"),
  "utf8",
);

describe("灯箱 · 原图加载超时兜底", () => {
  it("存在超时常量且被计时器使用", () => {
    expect(src, "缺原图加载超时常量").toMatch(/const IMAGE_LOAD_TIMEOUT_MS = \d/);
    expect(src).toMatch(/setTimeout\(\s*\(\)\s*=>\s*setStatus\('error'\)\s*,\s*IMAGE_LOAD_TIMEOUT_MS/);
  });

  it("仅在 loading 且确有图片时才挂计时器", () => {
    const i = src.indexOf("setStatus('error'), IMAGE_LOAD_TIMEOUT_MS");
    expect(i).toBeGreaterThan(-1);
    const block = src.slice(src.lastIndexOf("useEffect", i), i);
    expect(block).toMatch(/status\s*!==\s*'loading'/);
    expect(block).toMatch(/imageId === null/);
  });

  it("计时器依赖含 imageId：翻页要重新计时", () => {
    const i = src.indexOf("setStatus('error'), IMAGE_LOAD_TIMEOUT_MS");
    // 依赖写成 imageId（image?.id 的稳定取值）：写 image 对象会让计时器
    // 在无关重渲染中重来，且会触发 exhaustive-deps 警告。
    expect(src, "缺 imageId 派生值").toMatch(/const imageId = image\?\.id \?\? null/);
    const block = src.slice(src.lastIndexOf("useEffect", i), i + 160);
    expect(block).toMatch(/status\s*!==\s*'loading'/);
    expect(block, "守卫未排除占位态（无图时不该倒计时）").toContain("imageId === null");
    const deps = src.slice(i, i + 160);
    expect(deps).toContain("imageId");
    expect(deps, "计时器未清理").toContain("clearTimeout");
  });

  it("超时复用既有错误态（不新增一套 UI）", () => {
    // 错误态仍由 status === 'error' 渲染，超时只是把 status 推过去
    expect(src).toMatch(/status === 'error'\s*\?/);
    expect(src).toContain("在新标签页打开");
  });
});
