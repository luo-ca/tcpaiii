import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 「来源站点」这个数字不能宣称成「使用本 API 的网站总数」。
 *
 * totalSites 来自 handleStats:
 *     totalSites: Object.keys(stats.sites).length
 * 而 stats.sites 只由 updateRequestStats 里的一句写入：
 *     const site = getRequestSite(request);
 *     if (site) stats.sites[site] = ...
 * getRequestSite 只认 **Origin / Referer**，取自 referrer 的主机名。
 * 于是有两处系统性低估：
 *   1. 服务端 / 代理 / curl / 无来源头的调用方一律不计；
 *   2. sites 表被 pruneSites 截到 MAX_TRACKED_SITES(500)，
 *      超过之后这个数字就不再增长，而它是「当前被跟踪的来源数」，
 *      不是「历史累计接入站点数」。
 *
 * 原来的文案「接入站点 / 使用本 API 的网站」把这两点都说满了 —— 是
 * 一个会随流量增长而越来越不准的断言。数字没变，改的是它的说法。
 * 这条测试把「文案必须与统计口径一致」钉住。
 */

const uiRaw = readFileSync(
  resolve(process.cwd(), "src/components/sections/RealtimeStats.tsx"),
  "utf8",
);

/**
 * 只看生效的代码，不看注释。
 * 注释里为了说明「为什么改」必然要引用旧文案（「接入站点」等），
 * 若不去注释就断言 not.toContain，会命中说明文字而误报 —— 第一次写这条
 * 测试时就踩到了。这里把 // 行注释与 JSX 注释都剥掉再断言。
 */
const ui = uiRaw
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");
const stats = readFileSync(
  resolve(process.cwd(), "edge-functions-src/lib/stats.ts"),
  "utf8",
);

describe("统计卡片 · 来源站点文案与口径一致", () => {
  it("不再宣称是「使用本 API 的网站」", () => {
    expect(ui, "文案又在宣称网站总数了").not.toContain("使用本 API 的网站");
    expect(ui).not.toContain("'接入站点'");
  });

  it("改用与口径一致的措辞", () => {
    expect(ui).toContain("来源站点");
    expect(ui, "副标题需说明只统计带来源头的浏览器请求").toContain("来源头");
  });

  it("口径确实是「去重后的 referrer 主机名」，且被截断过", () => {
    // 口径没变：仍然是 sites 表的 key 数量
    expect(stats).toMatch(/totalSites:\s*Object\.keys\(stats\.sites\)\.length/);
    // 且确实有上限截断 —— 这正是「不是总数」的原因
    expect(stats).toMatch(/pruneSites\(stats\.sites\)/);
  });
});
