import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 「跳到主内容」必须排在页头之前（P168）。
 *
 * 它的唯一作用就是让键盘 / 读屏用户**免于**逐个 Tab 过整条顶栏。
 * DOM 顺序 = Tab 顺序，所以它必须是文档里第一个可聚焦元素。
 *
 * 实测（无头 Chrome，构建产物，Tab 十次）：
 *   修复前：Logo → 随机 → 图库 → API 文档 → 状态 → PAIII → 跳到主内容 → 搜索框 …
 *           —— 要 Tab 7 次才够到它，它想省下的那件事已经先做完了，形同虚设。
 *   修复后：跳到主内容 → Logo → 随机 → 图库 → API 文档 → 状态 → PAIII → 搜索框 …
 * 同一次实测确认按下 Enter 后 location.hash=#main、焦点落到 <main>、页面滚到主内容。
 *
 * 为什么容易再坏：它在源码里紧挨着 <Header />，视觉上又是 `sr-only`（平时看不见），
 * 顺手挪一下就无声失效 —— 而失效的表现是「键盘用户多按几次 Tab」，
 * 没人会为此报 bug。
 */

const APP = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("跳过链接 · 必须是第一个可聚焦元素", () => {
  const headerAt = APP.indexOf("<Header />");
  const skipAt = APP.indexOf('href="#main"');

  it("App.tsx 里同时存在 <Header /> 与跳过链接", () => {
    expect(headerAt, "找不到 <Header />").toBeGreaterThan(-1);
    expect(skipAt, "找不到跳过链接（href=\"#main\"）").toBeGreaterThan(-1);
  });

  it("跳过链接在 <Header /> 之前 —— 否则 Tab 顺序上它排在整条导航之后", () => {
    expect(
      skipAt,
      "跳过链接排在了 <Header /> 之后：键盘用户必须先 Tab 过全部页头导航才够得到它，它就白写了",
    ).toBeLessThan(headerAt);
  });

  it("跳过链接保留 sr-only + focus:not-sr-only（平时隐藏、聚焦显形）", () => {
    const block = APP.slice(skipAt, skipAt + 600);
    expect(block, "缺 sr-only").toMatch(/sr-only/);
    expect(block, "缺 focus:not-sr-only —— 聚焦后不会显形").toMatch(/focus:not-sr-only/);
  });

  it("目标 #main 存在且可编程聚焦（tabIndex={-1}）", () => {
    const mainAt = APP.indexOf('id="main"');
    expect(mainAt, "找不到 <main id=\"main\">").toBeGreaterThan(-1);
    const mainBlock = APP.slice(mainAt, mainAt + 200);
    expect(mainBlock, "<main> 缺 tabIndex={-1}，跳过链接无法把焦点交给它").toMatch(/tabIndex=\{-1\}/);
  });
});
