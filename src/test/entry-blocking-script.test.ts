import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 入口层第三方脚本不得阻塞 HTML 解析。
 *
 * index.html 的 <head> 里挂着唯一一个第三方脚本 —— imgs CDN 上的 WAF /
 * 防调试脚本 gbts.js。实测该请求：
 *   · 17.6 KB
 *   · 响应头 Cache-Control: no-cache —— 每次页面加载都回源重取，拿到缓存的前提
 *     是先发一次条件请求
 *   · 它原本是 <script src=...> 同步放在 head 里，没有任何 async/defer
 *
 * 于是 HTML 解析被钉死在这一个跨域请求上：imgs 域名慢或挂，整站白屏。
 * 首屏渲染时间不再由本站决定。
 *
 * defer 同时是语义上更正确的时机：脚本内部靠
 *   document.querySelector("[disable-devtool-auto]")
 * 找自己那个标签读配置，defer 保证解析完毕、元素必然存在。
 * 已确认脚本不含 document.write / document.currentScript，可安全延迟。
 *
 * 无头实测（defer 之后）：DisableDevtool 全局存在、isRunning=true、
 * version=0.3.9，且 React 正常挂载 —— 功能未退化。
 */

const indexHtml = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

describe("入口层 · 第三方脚本不得阻塞解析", () => {
  it("gbts.js（WAF / 防调试）带 defer", () => {
    const tag = indexHtml.match(/<script[^>]*gbts\.js[^>]*>/)?.[0];
    expect(tag, "未能定位 gbts.js 的 <script> 标签").toBeTruthy();
    expect(
      tag!,
      "WAF 脚本必须在 head 里同步执行 —— 17.6KB 且 no-cache，会阻塞 HTML 解析、拖垮首屏",
    ).toMatch(/\bdefer\b/);
  });

  it("保留 disable-devtool-auto 属性（脚本靠它读配置并自动初始化）", () => {
    const tag = indexHtml.match(/<script[^>]*gbts\.js[^>]*>/)?.[0];
    expect(
      tag!,
      "gbts.js 靠 document.querySelector(\"[disable-devtool-auto]\") 找配置，删掉这个属性脚本会静默不干活",
    ).toContain("disable-devtool-auto");
  });

  it("head 里没有第二个无 async/defer 的外链脚本", () => {
    const head = indexHtml.slice(0, indexHtml.indexOf("</head>"));
    const remote = [...head.matchAll(/<script[^>]*\bsrc=[^>]*>/g)]
      .map((m) => m[0])
      .filter((tag) => /src\s*=\s*['"]https?:/.test(tag));
    for (const tag of remote) {
      expect(tag, `外链脚本缺少 defer/async，会阻塞解析：${tag}`).toMatch(/\b(defer|async)\b/);
    }
  });
});
