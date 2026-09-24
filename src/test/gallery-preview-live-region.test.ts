import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 首页「图库精选」的失败态要被读屏播报（P114）。
 *
 * 同页的其它失败态都挂在 role="alert" 上（ErrorState 是全站统一的错误卡，
 * 内含 role="alert"），公库页的加载失败也是 ErrorState。唯独首页图库精选
 * 这一段是就地手写的失败提示 —— 只给了一句可见文案，没有 aria。
 * 读屏用户点进来只会看到（听到）标题与后续区块，完全不知道这一块加载失败了。
 *
 * 修法：补 role="alert"。它同时满足两点：语义正确（错误提示），
 * 且内容插入时读屏会自动播报，不依赖用户主动浏览。
 */

const src = readFileSync(
  resolve(process.cwd(), "src/components/sections/GalleryPreview.tsx"),
  "utf8",
);

describe("首页图库精选 · 失败态有读屏播报", () => {
  it("失败提示容器带 role=alert", () => {
    const i = src.indexOf("图库精选暂时加载失败");
    expect(i, "未能定位失败提示").toBeGreaterThan(-1);
    const around = src.slice(Math.max(0, i - 400), i + 40);
    expect(around, "失败提示缺 role=alert：读屏不会播报").toContain('role="alert"');
  });

  it("重试按钮仍在（role=alert 的修复不改变可操作路径）", () => {
    const i = src.indexOf("图库精选暂时加载失败");
    const after = src.slice(i, i + 900);
    expect(after, "重试按钮消失").toContain("重试");
    expect(after, "重试按钮缺 disabled 反馈").toContain("disabled={isFetching}");
  });
});
