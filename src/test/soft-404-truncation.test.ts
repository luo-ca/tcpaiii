import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 软 404 的提示文案必须截断路径（P148）。
 *
 * router.ts 在模块求值期做软 404 收口：路径不在 ROUTES 里就改写回 '/'，
 * 并弹一条 toast.warning 告诉用户「页面「xxx」不存在，已回到首页」。
 *
 * 问题：xxx 是**未截断的用户输入**（window.location.pathname）。
 * 现实触发路径：
 *   · 用户点了一个拼错/被截断的分享链接；
 *   · 爬虫或扫描器请求超长垃圾路径（这类请求很常见）；
 *   · 有人手工粘贴一长串。
 *
 * toast 是文本渲染（React 子节点），不会执行 HTML，所以**没有 XSS**；
 * 但 3000 字符的路径会拼出 3000+ 字的 toast，在页面上铺成一大块文本、
 * 盖住内容，并且会一直停留到用户手动关掉。
 *
 * 修法：截断路径再拼文案，并在截断时加省略号，让用户知道被截了。
 */

const ROUTER = readFileSync(resolve(process.cwd(), "src/lib/router.ts"), "utf8");

describe("软 404 提示 · 路径截断（P148）", () => {
  it("提示文案走截断函数，不是原样拼接 rawPath", () => {
    // 截断已抽成依赖注入的纯函数：先钉住 toast 文案用的是它。
    const toastIdx = ROUTER.indexOf("不存在，已回到首页");
    expect(toastIdx, "找不到软 404 提示文案").toBeGreaterThan(-1);
    const line = ROUTER.slice(ROUTER.lastIndexOf("toast.warning", toastIdx), toastIdx);
    expect(line, "提示文案直接用了未截断的 rawPath").toContain("truncatePathForDisplay(rawPath)");
  });

  it("截断函数本身按上限裁剪并加省略号（可单独调用验证）", async () => {
    const mod = await import("@/lib/router");
    const short = "/gallery";
    expect(mod.truncatePathForDisplay(short)).toBe(short);
    const long = "/" + "x".repeat(500);
    const out = mod.truncatePathForDisplay(long);
    expect(out.length, "截断后仍超长").toBeLessThanOrEqual(61);
    expect(out.endsWith("…"), "截断后没有省略号").toBe(true);
    expect(out.startsWith("/xxx")).toBe(true);
  });

  it("截断后仍有省略号，让用户知道被截了", () => {
    expect(ROUTER, "截断后没有省略号提示").toMatch(/…|\.\.\./);
  });

  it("改写地址栏仍是精确的 '/'（不受截断影响）", () => {
    expect(ROUTER).toMatch(/replaceState\(null, '', '\/'\)/);
  });

  it("截断上限是常量而非魔法数字散落", () => {
    expect(ROUTER, "缺可复用的截断上限常量").toMatch(/MAX_[A-Z_]*PATH|PATH_DISPLAY_MAX|MAX_PATH/);
  });
});