import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * check:api 体检脚本必须覆盖前端首屏依赖的读接口（P155）。
 *
 * 脚本的用途（README）：部署后手动跑一遍，确认线上接口真的活着。
 * 它是**唯一的线上冒烟测试** —— 本仓库没有 CI。
 *
 * 现状：只检查 `/api/stats`、`/api/random`（302 与 json 两种形态）。
 * 漏掉两个前端首屏就依赖的读接口：
 *
 *   · `/api/list`   —— 首页「最新收录」「Hero 主视觉」、/gallery 全部靠它取图；
 *   · `/api/health` —— /status 状态页的第一屏，且是排查线上故障的入口。
 *
 * 后果：部署后 `npm run check:api` 全绿，但用户打开首页白屏 / 状态页报错 ——
 * 体检脚本给了虚假的安心。
 *
 * 断言：这两个接口必须在脚本里被检查到（不要求具体断言多深，
 * 但必须真的请求一次，否则等于没覆盖）。
 */

const SCRIPT = readFileSync(resolve(process.cwd(), "scripts/check-api.mjs"), "utf8");

/** 脚本里实际请求的路径（fetchText / fetch 的实参） */
function requestedPaths(): string[] {
  return [...SCRIPT.matchAll(/['"`](\/api\/[a-z-]+(?:\?[^'"`]*)?)['"`]/g)].map((m) => m[1]);
}

describe("check:api 覆盖度（P155）", () => {
  it("能解析出脚本请求的接口（防止解析失效导致空跑）", () => {
    const paths = requestedPaths();
    expect(paths.length, "没解析到任何 /api 路径").toBeGreaterThanOrEqual(2);
    expect(paths.some((p) => p.startsWith("/api/random"))).toBe(true);
  });

  it("覆盖 /api/list —— 首页与图库的唯一取图接口", () => {
    const paths = requestedPaths();
    expect(
      paths.some((p) => p.startsWith("/api/list")),
      "/api/list 未体检：它坏了首页与 /gallery 都取不到图，脚本却会全绿",
    ).toBe(true);
  });

  it("覆盖 /api/health —— 状态页与线上排障入口", () => {
    const paths = requestedPaths();
    expect(
      paths.some((p) => p.startsWith("/api/health")),
      "/api/health 未体检：状态页第一屏依赖它，它坏了体检仍会通过",
    ).toBe(true);
  });

  it("保留既有的 stats 与 random 覆盖（回归闸）", () => {
    const paths = requestedPaths();
    expect(paths.some((p) => p.startsWith("/api/stats"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/api/random"))).toBe(true);
  });

  it("失败时以非零退出（否则脚本会假装成功）", () => {
    expect(SCRIPT).toMatch(/process\.exitCode\s*=\s*1/);
  });

  it("可覆盖目标域名（默认线上，允许指向预览/本地）", () => {
    expect(SCRIPT).toMatch(/API_BASE_URL/);
  });
});