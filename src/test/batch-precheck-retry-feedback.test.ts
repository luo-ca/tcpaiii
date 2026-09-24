import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 后台「库内地址预检失败」的重试按钮要有进行中反馈（P109）。
 *
 * 批量导入会先拉全库地址做去重预检；预检失败时给一行提示 + 一个「重试」。
 * 这个按钮原先没有 disabled / 文案切换：请求要等一次网络往返，用户点完
 * 看不到任何变化，容易连点，每次都再发一个请求。
 *
 * 与首页「图库精选」的重试按钮是同一类问题（那次已修），这里补齐，
 * 全站的重试按钮口径统一为「请求中禁用 + 文案切换」。
 */

const src = readFileSync(
  resolve(process.cwd(), "src/features/admin/add-image-dialog.tsx"),
  "utf8",
);

function retryButtonBlock(): string {
  const i = src.indexOf("库内地址读取失败");
  expect(i, "未能定位预检失败提示").toBeGreaterThan(-1);
  const start = src.indexOf("<button", i);
  expect(start, "未能定位重试按钮").toBeGreaterThan(-1);
  const end = src.indexOf("</button>", start);
  expect(end, "未能定位重试按钮结束").toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("批量导入预检 · 重试按钮有进行中反馈", () => {
  it("请求中禁用（避免连点放大请求）", () => {
    const block = retryButtonBlock();
    expect(block, "缺 disabled={existingUrlsQuery.isFetching}").toContain(
      "disabled={existingUrlsQuery.isFetching}",
    );
  });

  it("文案随状态切换，并标 aria-busy", () => {
    const block = retryButtonBlock();
    expect(block, "缺「重试中…」文案").toContain("重试中…");
    expect(block, "缺 aria-busy：读屏无从得知正在重试").toContain(
      "aria-busy={existingUrlsQuery.isFetching}",
    );
  });

  it("禁用态有可见的弱化样式", () => {
    const block = retryButtonBlock();
    expect(block, "禁用时外观无变化，用户仍以为可点").toContain("disabled:opacity-60");
  });
});
