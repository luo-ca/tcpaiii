import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 隐藏标签页必须停表，切回立即补一次（P58）。
 *
 * 全站 refetchOnWindowFocus 默认关（main.tsx），stats 与 health 却各自挂着
 * 固定 refetchInterval（15s / 30s）。原来是无条件轮询，于是：
 *   · 用户切到别的标签页后请求照跑 —— 白耗边缘调用与调用量统计；
 *   · 后台定时器会被浏览器节流到不可预测的时机，切回来看到的是一段
 *     「不知道多旧」的数字，比挂着不动更糟。
 *
 * 修法：间隔用函数形式返回 —— document.hidden 时返回 false（停表），
 * 并单独打开 refetchOnWindowFocus，让切回来的那一瞬补一次。
 *
 * 注意约定：refetchInterval 只有在**函数**形式下才能动态停表；
 * 写死数字（哪怕配了 refetchOnWindowFocus）后台仍会继续打接口。
 */

const apiSource = readFileSync(resolve(process.cwd(), "src/lib/api.ts"), "utf8");
const statusSource = readFileSync(
  resolve(process.cwd(), "src/features/status-page.tsx"),
  "utf8",
);

/** 取出一段源码里 `refetchInterval` 的值文本（到行尾或逗号为止）。 */
function intervalValue(source: string): string {
  const index = source.indexOf("refetchInterval");
  expect(index, "未找到 refetchInterval").toBeGreaterThan(-1);
  return source.slice(index, source.indexOf("\n", index));
}

describe("stats 轮询：隐藏时停表", () => {
  it("refetchInterval 不是写死的数字（固定值无法停表）", () => {
    const line = intervalValue(apiSource);
    expect(line, `refetchInterval 仍是固定值：${line}`).not.toMatch(/refetchInterval:\s*[\d_]/);
    expect(line, `refetchInterval 既非数字也非函数引用：${line}`).toMatch(
      /refetchInterval:\s*(\w+\(|()\s*=>|\w+[,\s])/,
    );
  });

  it("停表判定基于 document.hidden，且间隔常量仍是 15s", () => {
    const start = apiSource.indexOf("function statsPollInterval");
    expect(start, "未找到 statsPollInterval").toBeGreaterThan(-1);
    const body = apiSource.slice(start, start + 300);
    expect(body).toContain("document.hidden");
    expect(body).toContain("STATS_POLL_MS");
    expect(apiSource, "15s 间隔被改动").toMatch(/STATS_POLL_MS\s*=\s*15_000/);
  });

  it("打开 refetchOnWindowFocus：停表期间的空档在切回时补上", () => {
    const options = apiSource.slice(
      apiSource.indexOf("export function statsQueryOptions"),
      apiSource.indexOf("// ---- Gallery API ----"),
    );
    expect(options).toMatch(/refetchOnWindowFocus:\s*true/);
  });
});

describe("health 轮询：同样停表 + 切回复检", () => {
  it("refetchInterval 是函数且含 document.hidden，保留 30s", () => {
    const line = intervalValue(statusSource);
    expect(line, `health 的 refetchInterval 仍是固定值：${line}`).toMatch(
      /refetchInterval:\s*\(\)\s*=>/,
    );
    expect(line).toContain("document.hidden");
    expect(line).toContain("30_000");
  });

  it("health 也打开 refetchOnWindowFocus", () => {
    const block = statusSource.slice(
      statusSource.indexOf("queryKey: ['health']"),
      statusSource.indexOf("retry: 1"),
    );
    expect(block).toMatch(/refetchOnWindowFocus:\s*true/);
  });
});
