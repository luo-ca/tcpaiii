import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 部署配置与实际构建产物必须对齐。
 *
 * edgeone.json 是 EdgeOne Pages 唯一的部署描述：
 *   buildCommand    —— 部署前跑什么
 *   outputDirectory —— 把哪个目录发布上去
 * 它和 package.json / vite.config.ts 是**两处独立的事实来源**，
 * 但必须描述同一件事。现网两边是一致的，可是没有任何东西钉住它。
 *
 * 为什么这个缺口值得堵：
 *   · outputDirectory 与 vite 的 outDir 一旦不一致（比如改了 vite 的 outDir
 *     却忘了同步 edgeone.json），部署上去的是空目录或上一版残留 ——
 *     而 lint / test / build 全都照绿，因为本地构建根本不看 edgeone.json。
 *   · buildCommand 若不再跑 build:functions，edge-functions/ 就不会刷新，
 *     部署的函数是旧的（P85 已单独钉住产物与源码一致，这里补上「谁来生成它」）。
 */

const edgeone = JSON.parse(
  readFileSync(resolve(process.cwd(), "edgeone.json"), "utf8"),
) as { buildCommand: string; outputDirectory: string };
const pkg = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
) as { scripts: Record<string, string> };
const viteConfig = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");

describe("部署配置一致性", () => {
  it("buildCommand 指向 package.json 里真实存在的脚本", () => {
    const match = edgeone.buildCommand.match(/npm run ([a-z:]+)/i);
    expect(match, `无法解析 buildCommand：${edgeone.buildCommand}`).toBeTruthy();
    expect(
      pkg.scripts[match![1]],
      `edgeone.json 的 buildCommand 调用了不存在的脚本 "${match![1]}"`,
    ).toBeDefined();
  });

  it("buildCommand 会生成 edge-functions 产物（否则部署的是旧函数）", () => {
    // 直接或间接都要覆盖：build 可以是 build:functions && vite build
    const buildScript = pkg.scripts.build ?? "";
    const viaBuild = /build:functions/.test(buildScript);
    const direct = /build:functions/.test(edgeone.buildCommand);
    expect(
      viaBuild || direct,
      "构建链路里没有 build:functions，edge-functions/ 不会刷新",
    ).toBe(true);
  });

  it("outputDirectory 与 vite 的输出目录一致", () => {
    // vite 没显式写 outDir 时用默认值 "dist"
    const configured = viteConfig.match(/outDir:\s*["']([^"']+)["']/)?.[1];
    const actual = configured ?? "dist";
    expect(
      edgeone.outputDirectory,
      `edgeone.json 发布 "${edgeone.outputDirectory}"，但 vite 实际输出到 "${actual}" —— 部署会发空目录或旧版本`,
    ).toBe(actual);
  });

  it("outputDirectory 不是空串（空串会让部署发不出内容）", () => {
    expect(edgeone.outputDirectory.trim().length).toBeGreaterThan(0);
  });
});
