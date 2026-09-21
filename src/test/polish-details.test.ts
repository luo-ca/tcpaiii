import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 细节打磨轮（A 修缺陷 / B 状态页增强 / D 筛选分享）的行为契约。
 *
 * 这些点都是「代码能跑但对用户不对」的小毛病：越界输入不回写、按钮做了事
 * 却不告诉读屏用户、文案与实现打架、能分享的链接不提示。每条都是用户直接
 * 感知的，靠源码断言钉住防止回归。
 */

const adminSource = readFileSync(
  resolve(process.cwd(), "src/features/admin-page.tsx"),
  "utf8",
);
const gallerySource = readFileSync(
  resolve(process.cwd(), "src/features/gallery-browse.tsx"),
  "utf8",
);
const statusSource = readFileSync(
  resolve(process.cwd(), "src/features/status-page.tsx"),
  "utf8",
);

describe("A · admin 跳页输入越界必须夹取并回写", () => {
  it("handlePageJump 用 clampNumber 夹取后再跳，并把结果写回输入框", () => {
    const block = adminSource.slice(
      adminSource.indexOf("const handlePageJump"),
      adminSource.indexOf("const clearFilters"),
    );
    expect(block, "未能定位 handlePageJump").not.toBe("");
    // 必须夹取
    expect(block).toMatch(/clampNumber\(\s*nextPage\s*,\s*1\s*,\s*totalPages\s*\)/);
    // 且夹取结果要回到输入框：否则框里 999、实际在第 3 页，界面自相矛盾
    expect(block).toMatch(/setPageJumpInput\(\s*String\(\s*clamped\s*\)\s*\)/);
  });
});

describe("A · 图库「加载更多」要有 live region 播报", () => {
  it("存在 sr-only 的 aria-live 区域，覆盖加载中 / 还有更多 / 已到底三态", () => {
    expect(gallerySource).toMatch(/aria-live="polite"/);
    expect(gallerySource).toMatch(/sr-only/);
    expect(gallerySource).toContain("正在加载更多图片");
    expect(gallerySource).toMatch(/还有更多/);
    expect(gallerySource).toMatch(/已全部加载/);
  });

  it("播报区在分页区块内（跟着「加载更多」按钮走）", () => {
    const pagination = gallerySource.slice(
      gallerySource.indexOf("mt-8 flex flex-col items-center"),
      gallerySource.indexOf("<ImageLightbox"),
    );
    expect(pagination).toMatch(/aria-live="polite"/);
    expect(pagination).toContain("正在加载更多图片");
  });
});

describe("B · 状态页测速文案与实现一致（manual 不跟随跳转）", () => {
  it("文案不得再声称「含 302 跳转 / 端到端」——P54 已改 redirect:manual", () => {
    expect(statusSource).not.toContain("含 302 跳转");
    expect(statusSource).not.toContain("端到端响应头耗时");
    expect(statusSource).toMatch(/不跟随 302/);
  });
});

describe("B · 状态页降级提示要点名缺哪个绑定", () => {
  it("degradedNote 逐项列出未绑定的命名空间", () => {
    expect(statusSource).toMatch(/function degradedNote/);
    expect(statusSource).toContain("图库 (images)");
    expect(statusSource).toContain("统计 (stats)");
    // 渲染 degraded 时用具体说明而不是笼统 BANNER_TEXT
    expect(statusSource).toMatch(/overall\.kind === 'degraded'\s*\?\s*degradedNote\(overall\.health\)/);
  });
});

describe("B · 状态页可复制摘要 / 构建版本显示短哈希", () => {
  it("摘要包含关键环境字段，且走 copyText 有成功反馈", () => {
    expect(statusSource).toMatch(/function shortBuildId/);
    expect(statusSource).toMatch(/shortBuildId\(\s*overall\.health\.buildId\s*\)/);
    const handler = statusSource.slice(
      statusSource.indexOf("const handleCopySummary"),
      statusSource.indexOf("void copyText(lines.join"),
    );
    expect(handler, "未能定位 handleCopySummary 函数体").not.toBe("");
    expect(handler).toContain("派次元 API 状态");
    expect(handler).toContain("KV 绑定");
    expect(handler).toContain("构建版本");
    expect(statusSource).toMatch(/copyText\(lines\.join/);
  });
});

describe("D · 图库筛选可复制分享链接", () => {
  it("有筛选时提供「复制链接」，复制当前完整地址", () => {
    expect(gallerySource).toContain("复制链接");
    expect(gallerySource).toMatch(/function handleCopyShareLink|const handleCopyShareLink/);
    const handler = gallerySource.slice(
      gallerySource.indexOf("handleCopyShareLink = "),
      gallerySource.indexOf("const openTile"),
    );
    expect(handler).toMatch(/copyText\(\s*window\.location\.href/);
  });

  it("「复制链接」与「清空筛选」都在 hasFilter 分支内出现", () => {
    const filterBlock = gallerySource.slice(
      gallerySource.indexOf("{hasFilter && ("),
      gallerySource.indexOf("</div>", gallerySource.indexOf("{hasFilter && (")),
    );
    expect(filterBlock).toContain("复制链接");
    expect(filterBlock).toContain("清空筛选");
  });
});
