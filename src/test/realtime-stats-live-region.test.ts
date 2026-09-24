import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 首页「实时统计」的失败提示要被读屏播报（P116）。
 *
 * 这一块与首页「图库精选」是同一类手写失败提示：视觉上有文案，
 * 但没有 aria —— 读屏用户翻到这里只会觉得区块凭空消失了
 * （组件在无数据且非错误时 return null，所以正常时本来就不渲染，
 * 一旦失败也没有可感知的差别）。
 *
 * 修法：补 role="alert"，与图库精选保持一致。
 */

const src = readFileSync(
  resolve(process.cwd(), "src/components/sections/RealtimeStats.tsx"),
  "utf8",
);

describe("首页实时统计 · 失败态有读屏播报", () => {
  it("失败提示容器带 role=alert", () => {
    const i = src.indexOf("实时统计暂时读取失败");
    expect(i, "未能定位失败提示").toBeGreaterThan(-1);
    const around = src.slice(Math.max(0, i - 320), i + 40);
    expect(around, "失败提示缺 role=alert：读屏不会播报").toContain('role="alert"');
  });

  it("失败态仍带自动重试说明（不改变原有承诺）", () => {
    const i = src.indexOf("实时统计暂时读取失败");
    const text = src.slice(i, i + 120);
    expect(text, "自动重试说明被改动").toContain("15 秒");
  });
});
