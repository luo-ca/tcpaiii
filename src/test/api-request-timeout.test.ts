import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getErrorMessage } from "@/lib/helpers";

/**
 * API 请求超时兜底（P138）。
 *
 * fetch 自身没有超时。边缘函数挂住（TCP 连着但永不返回）、回源卡死、
 * 中间层把连接吊在半路时，apiRequest 的 await 会一直悬着 —— 而调用方的
 * loading 全挂在它身上：首页主视觉、状态页复检、图库首屏都会永远停在
 * 加载态，用户既看不到错也等不到结果。
 *
 * 这是 P135/P136 同一类问题在更底层的一层：那两次修的是「图片事件缺兜底」，
 * 这次是「HTTP 请求本身缺兜底」。
 *
 * 超时抛出的 DOMException 必须译成中文，否则中文界面里会冒出
 * 「获取随机图片失败: The operation was aborted due to timeout」。
 * 但**不能**把「用户主动取消」(AbortError) 也译成超时 —— 那是主动行为，
 * 谎报成故障会误导用户。两者靠 name 区分（实测确认）：
 *   AbortSignal.timeout()   → name === 'TimeoutError'
 *   AbortController.abort() → name === 'AbortError'
 */

const clientSource = readFileSync(resolve(process.cwd(), "src/lib/api-client.ts"), "utf8");
const helperSource = readFileSync(resolve(process.cwd(), "src/lib/helpers.ts"), "utf8");

describe("apiRequest · 请求超时兜底", () => {
  it("声明了超时常量", () => {
    expect(clientSource, "缺 API 请求超时常量").toMatch(
      /const API_REQUEST_TIMEOUT_MS = \d[\d_]*;/,
    );
  });

  it("fetch 挂上超时 signal", () => {
    expect(clientSource, "fetch 未挂超时 signal").toContain("AbortSignal.timeout(");
    expect(clientSource).toContain("API_REQUEST_TIMEOUT_MS");
    // signal 必须在实际 fetch 的 init 里传下去，光创建不传等于没加
    const fetchIdx = clientSource.indexOf("const response = await fetch(");
    expect(fetchIdx, "未找到 fetch 调用").toBeGreaterThan(-1);
    const fetchBlock = clientSource.slice(fetchIdx, fetchIdx + 400);
    expect(fetchBlock, "signal 未传进 fetch init").toMatch(/\bsignal\b/);
  });

  it("尊重调用方自带的 signal（不硬覆盖）", () => {
    expect(clientSource).toMatch(/init\?\.signal\s*\?\?\s*timeoutSignal/);
  });
});

describe("getErrorMessage · 超时译成中文且不误伤主动取消", () => {
  it("TimeoutError 译成中文超时提示", () => {
    const err = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    const msg = getErrorMessage(err, "获取随机图片失败");
    expect(msg, "超时未中文化").not.toContain("aborted");
    expect(msg).toContain("超时");
  });

  it("AbortError（用户主动取消）不得被译成超时", () => {
    const err = new DOMException("The operation was aborted.", "AbortError");
    // 既有契约（P131）：主动取消原样透传，不谎报成故障
    expect(getErrorMessage(err, "已取消")).toBe("The operation was aborted.");
  });

  it("判定只看 name，不按 message 关键词猜", () => {
    // 若按 message 里的 "aborted"/"timed out" 猜，下面这条会被误译
    const tricky = new DOMException("request was aborted by user", "AbortError");
    expect(getErrorMessage(tricky, "已取消")).toBe("request was aborted by user");
    expect(helperSource, "超时判定应锚定 name === 'TimeoutError'").toContain(
      "error.name === 'TimeoutError'",
    );
  });
});
