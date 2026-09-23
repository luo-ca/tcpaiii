import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 首页「图库精选」的重试按钮必须有进行中反馈（P101）。
 *
 * 其余各处重试按钮都做了这一层（gallery-browse / admin 走 ErrorState，
 * status 页的「重新检查」带 disabled + 旋转图标），唯独这里的按钮点了之后
 * 外观毫无变化 —— 接口慢或又失败时，用户看到的是「点了没反应」，
 * 于是反复点，每次都再发一个请求。
 *
 * 这类「无反馈的异步按钮」是交互层面最容易漏的一类：源码里 `onClick` 存在、
 * 功能正确，只有真正点下去才看得出缺反馈。所以钉在源码上：
 * 必须同时有 disabled 与「重试中…」文案切换。
 */

const src = readFileSync(
  resolve(process.cwd(), "src/components/sections/GalleryPreview.tsx"),
  "utf8",
);

describe("首页图库精选 · 重试按钮有进行中反馈", () => {
  it("解构出 isFetching 作为反馈依据", () => {
    expect(
      src,
      "未从 useQuery 取 isFetching：按钮无从知道请求是否在进行",
    ).toMatch(/isFetching/);
  });

  it("重试按钮在请求中被禁用（避免连点放大请求）", () => {
    const i = src.indexOf("onClick={() => void refetch()}");
    expect(i, "未能定位重试按钮").toBeGreaterThan(-1);
    const block = src.slice(i, src.indexOf("</Button>", i));
    expect(block, "缺 disabled={isFetching}：请求中仍可连点").toContain("disabled={isFetching}");
  });

  it("按钮文案与图标在请求中切换（用户看得到反馈）", () => {
    const i = src.indexOf("onClick={() => void refetch()}");
    const block = src.slice(i, src.indexOf("</Button>", i));
    expect(block, "缺「重试中…」文案").toContain("重试中…");
    expect(block, "缺 animate-spin 的加载图标").toContain("animate-spin");
    expect(block, "加载图标缺 aria-hidden").toMatch(/aria-hidden="true"/);
  });
});
