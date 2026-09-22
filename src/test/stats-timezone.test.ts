import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 「今日调用」下面那格日期必须与「今日」的分桶时区一致。
 *
 * 服务端按 STATS_TIME_ZONE（Asia/Shanghai）给 dailyRequests 分桶：
 *     getStatsDateKey() -> Intl.DateTimeFormat('zh-CN', { timeZone: STATS_TIME_ZONE })
 * 而前端原先用 new Date(stats.lastRequestAt).toLocaleDateString('zh-CN')
 * 渲染 —— 不带 timeZone，就按**访客本机时区**算。
 *
 * 实测（同一份线上数据 lastRequestAt=2026-09-22T01:11:18Z，
 * todayRequests=61 属于上海 9/22 桶）：
 *     Asia/Shanghai       -> 2026/9/22
 *     America/Los_Angeles -> 2026/9/21
 *     Pacific/Honolulu    -> 2026/9/21
 * 于是 UTC 以西的访客看到「今日调用 61 · 2026/9/21」——
 * 日期与它正上方的「今日」自相矛盾。
 *
 * 修法：显式传 timeZone: STATS_TIME_ZONE，与分桶口径对齐。
 * 相应地前端要有一份同值的常量（后端那份不能直接 import）。
 */

const ui = readFileSync(
  resolve(process.cwd(), "src/components/sections/RealtimeStats.tsx"),
  "utf8",
);
const feConst = readFileSync(resolve(process.cwd(), "src/lib/constants.ts"), "utf8");
const beTypes = readFileSync(
  resolve(process.cwd(), "edge-functions-src/lib/types.ts"),
  "utf8",
);

describe("今日调用 · 日期显示与分桶时区一致", () => {
  it("渲染日期时显式指定 timeZone", () => {
    expect(ui, "日期渲染又变回按访客本地时区了").toMatch(
      /toLocaleDateString\(\s*'zh-CN'\s*,\s*\{[\s\S]{0,80}timeZone:\s*STATS_TIME_ZONE/,
    );
  });

  it("前端常量与后端 STATS_TIME_ZONE 同值", () => {
    const fe = feConst.match(/STATS_TIME_ZONE\s*=\s*'([^']+)'/)?.[1];
    const be = beTypes.match(/STATS_TIME_ZONE\s*=\s*'([^']+)'/)?.[1];
    expect(fe, "前端缺少 STATS_TIME_ZONE").toBeTruthy();
    expect(be, "后端缺少 STATS_TIME_ZONE").toBeTruthy();
    expect(fe, "前后端时区不一致会导致跨时区访客看到打架的日期").toBe(be);
  });

  it("分桶确实用同一个常量（口径没被改走）", () => {
    const stats = readFileSync(
      resolve(process.cwd(), "edge-functions-src/lib/stats.ts"),
      "utf8",
    );
    expect(stats).toMatch(/timeZone:\s*STATS_TIME_ZONE/);
  });
});
