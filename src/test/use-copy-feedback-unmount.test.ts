import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * useCopyFeedback 的卸载安全（P139）。
 *
 * 仓库没装 @testing-library/react，不为一个测试引入新依赖 —— 改用源码结构
 * 断言，与 no-invisible-chars / api-request-timeout 等既有护栏同一路数。
 *
 * 要钉住的行为：copy() 首行 `await copyText(...)`，恢复后**不得**对已卸载
 * 组件 setState。原先只清理了「已计时」的 setTimeout（卸载时 clearTimeout），
 * 漏了「飞行中的 promise」这条：用户点复制后立刻关灯箱/切路由，await 期间
 * 组件卸载，promise 恢复后照样 setCopied(true) 并挂上一个**卸载之后才建立、
 * 永远不会被清理**的新计时器（useEffect 清理函数早已执行完）。
 *
 * 注意路径不用字面量拼：hook 目录名在编辑器/终端里容易混入西里尔同形字
 * （小写 o 的 U+043E），字面量一旦被污染就 ENOENT。改为按目录项的实际字节
 * 筛出来，顺带也验证了目录名确实是纯 ASCII。
 */

const srcDir = resolve(process.cwd(), "src");
// "hooks" 的 ASCII 字节序列；挑出真正的 hook 目录，不靠手打
const HOOKS_HEX = "686f6f6b73";
const hookDirName = readdirSync(srcDir).find(
  (name) => Buffer.from(name, "utf8").toString("hex") === HOOKS_HEX,
);

const source = readFileSync(join(srcDir, hookDirName ?? "", "use-copy-feedback.ts"), "utf8");

/**
 * 定位真实调用点。
 *
 * 用 lastIndexOf 而非 indexOf：文档注释里也写了 `await copyText(...)` 这个
 * 字样，indexOf 会先命中注释、切出一段注释文本，断言就失去意义
 * （实测踩到：断言收到的片段是注释而非代码）。
 */
function guardWindow(): string {
  const awaitIdx = source.lastIndexOf("await copyText(text");
  const setIdx = source.lastIndexOf("setCopied(true)");
  expect(awaitIdx, "未找到真实的 await copyText 调用").toBeGreaterThan(-1);
  expect(setIdx, "未找到 setCopied").toBeGreaterThan(awaitIdx);
  return source.slice(awaitIdx, setIdx);
}

describe("useCopyFeedback · 卸载安全", () => {
  it("hook 目录名为纯 ASCII（顺带钉住同形字污染）", () => {
    expect(hookDirName, "未找到纯 ASCII 的 hook 目录（可能被同形字污染）").toBeTruthy();
  });

  it("声明了挂载标记 ref", () => {
    expect(source, "缺少 mountedRef 挂载标记").toMatch(/const mountedRef = useRef\(true\)/);
  });

  it("卸载清理里把挂载标记置 false，并清掉计时器", () => {
    expect(source, "卸载未重置 mountedRef").toContain("mountedRef.current = false");
    expect(source, "卸载未清理计时器").toContain("clearTimeout(timerRef.current)");
  });

  it("await 之后、setCopied 之前有 mountedRef 守卫", () => {
    // 守卫必须落在两者之间 —— 放在 await 之前等于没防（那时必然还是挂载态）
    expect(
      guardWindow(),
      "await 与 setCopied 之间缺少 mountedRef 守卫：卸载后 promise 恢复仍会 setState",
    ).toContain("mountedRef.current");
  });

  it("守卫是提前返回，不是只做判断", () => {
    expect(guardWindow(), "守卫未提前返回，setState 仍会执行").toMatch(
      /if \(!mountedRef\.current\) return/,
    );
  });
});
