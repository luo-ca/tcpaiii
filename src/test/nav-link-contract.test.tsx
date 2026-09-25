import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { NavLink } from "@/components/ui/nav-link";

/**
 * 站内链接 NavLink 的契约（P167）。
 *
 * 为什么值得钉：它被 10 处使用（Header 3 / Footer 4 / DocsTeaser 1 /
 * GalleryPreview 1 / Hero 1），但行为此前零测试 —— 之前只有 footer-tap-target
 * 顺带扫过它的 className。
 *
 * 它的全部价值在 handleClick 的六条「放行 / 接管」判断上。任何一条写反，
 * 破坏的都是**浏览器最基础的行为**（中键开新标签、Ctrl+点击新标签页、
 * 右键菜单），而这类回归不会红任何现有测试，只会在用户手上静默失效。
 *
 * 本仓库没装 jsdom / testing-library（为这一个组件引两个开发依赖不划算），
 * 所以分两层：
 *   1. renderToStaticMarkup —— 真实渲染，钉住「渲染成真 <a href>」这个
 *      一切可分享性的前提（中键、右键、悬停看地址、爬虫都靠它）；
 *   2. 源码结构断言 —— 钉住六条分支的存在与语义方向，以及它们都在
 *      preventDefault **之前**（顺序写反 = 放行判断形同虚设）。
 *
 * 六条分支已在无头 Chrome 里实测过一遍（结果贴在断言旁），确认源码是对的 ——
 * 这里只是把「对」固定下来。
 */

const SOURCE = readFileSync(resolve(process.cwd(), "src/components/ui/nav-link.tsx"), "utf8");

describe("NavLink · 渲染成真链接（可分享性前提）", () => {
  it("渲染 <a href>，不是按钮 —— 中键/右键/悬停/爬虫都靠它", () => {
    const html = renderToStaticMarkup(createElement(NavLink, { to: "/docs", children: "API 文档" }));
    expect(html, "必须渲染成 <a>，不能退化成 <button>").toMatch(/^<a\b/);
    expect(html, "href 必须是目标路径本身").toContain('href="/docs"');
    expect(html, "子内容应原样渲染").toContain("API 文档");
  });

  it("target 透传到 <a>（外部场景需要 target=_blank）", () => {
    const html = renderToStaticMarkup(
      createElement(NavLink, { to: "/docs", target: "_blank", rel: "noreferrer", children: "x" }),
    );
    expect(html).toContain(`target="_blank"`);
    expect(html).toContain(`rel="noreferrer"`);
  });

  it("不把内部 onClick 泄漏成 HTML 属性", () => {
    const html = renderToStaticMarkup(createElement(NavLink, { to: "/docs", children: "x" }));
    expect(html, "onclick 不应出现在服务端渲染结果里").not.toMatch(/onclick/i);
  });
});

describe("NavLink · 六条放行/接管分支", () => {
  /** 取出 handleClick 函数体，避免整份源码里搜到别处同名判断 */
  const body = (() => {
    const i = SOURCE.indexOf("const handleClick");
    expect(i, "找不到 handleClick").toBeGreaterThan(-1);
    const j = SOURCE.indexOf("event.preventDefault();", i);
    expect(j, "找不到 preventDefault 收口").toBeGreaterThan(-1);
    return SOURCE.slice(i, j);
  })();

  it("先给调用方机会：onClick 已 preventDefault 则放行", () => {
    expect(body, "缺「调用方已 preventDefault 则放行」").toMatch(/defaultPrevented/);
  });

  it("只接管左键（中键/右键交回浏览器）", () => {
    expect(body, "缺「非左键放行」判断").toMatch(/event\.button\s*!==\s*0/);
  });

  it("四类修饰键全部放行（Ctrl/Cmd/Shift/Alt + 点击 = 浏览器新标签页/新窗口）", () => {
    for (const key of ["metaKey", "ctrlKey", "shiftKey", "altKey"]) {
      expect(body, `缺 ${key} 放行 —— 修饰键点击会失去浏览器默认行为`).toContain(key);
    }
  });

  it("指定非 _self 的 target 时放行（交给浏览器开新窗口）", () => {
    expect(body, "缺 target 放行").toMatch(/target\s*&&\s*target\s*!==\s*["']_self["']/);
  });

  it("绝对地址（http:/mailto: 等）与协议相对（//）不拦截", () => {
    expect(body, "缺协议前缀识别 —— 外链会被错误接管成客户端跳转").toMatch(
      /\^\[a-z\]\[a-z0-9\+\.-\]\*:/i,
    );
    expect(body, "缺协议相对地址识别").toMatch(/startsWith\(\s*["']\/\/["']\s*\)/);
  });

  it("全部 5 条放行判断位于 preventDefault 之前（顺序写反 = 放行形同虚设）", () => {
    const i = SOURCE.indexOf("const handleClick");
    const end = SOURCE.indexOf("event.preventDefault();", i);
    const handler = SOURCE.slice(i, end);
    // 5 条 if 放行：defaultPrevented / 非左键 / 修饰键(四类合一) / target / 外链(两种合一)
    expect(handler.split("if (").length - 1, "放行分支数量异常").toBe(5);
    expect(handler, "放行分支缺 return（不返回就会继续往下接管）").toMatch(/return;\s*$/m);
  });

  it("接管时用 navigate 做客户端跳转（不整页刷新）", () => {
    const i = SOURCE.indexOf("event.preventDefault();");
    expect(SOURCE.slice(i, i + 200), "preventDefault 之后必须调 navigate").toMatch(/navigate\(to\)/);
  });
});
