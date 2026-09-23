import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * /status 状态横幅的窄屏换行回归（P95）。
 *
 * 横幅原本是恒定单行 flex：`flex items-center gap-3`，内部
 *   图标(28, shrink-0) + 文本块(min-w-0, 会被压) + 右侧动作区(shrink-0，
 *   两个按钮各 ~106px，whitespace-nowrap)
 * 三段抢一行。窄屏时 shrink-0 的两端不让步，唯一可压缩的文本块被挤成 0。
 *
 * 用无头 Chrome 跑真实构建产物 CSS + 真实 /status 页面逐档量到：
 *
 *   视口    文字块宽   标题行数   说明行数   横幅高
 *   280px     0.0px      竖排      竖排     326px
 *   320px     0.0px      竖排      竖排     326px
 *   340px     0.0px      竖排      竖排     326px
 *   360px    12.0px      —         —        326px   ← 仍是坏的
 *   375px    27.0px      —         —        326px   ← 仍是坏的
 *   390px    42.0px      2行       4行      161px
 *   640px   168.0px      1行       1行       79px   ← 只有这里才正常
 *
 * 也就是 640px 以下（全部手机 + 大部分平板竖屏）状态横幅的文字都在被压扁，
 * 280~340px 直接是 0px —— 那正是「接口挂了来看看状态页」最需要读清楚的场景。
 *
 * 修法：窄屏 `flex-col`（图标+文案一行、按钮换行到下一行），
 * `sm:flex-row sm:items-center` 在 ≥640px 恢复原来的单行横排。
 * 实测修后：280px 文字 164px / 高 183px，300~480px 文字 168px / 高 123px，
 * 640px 高 79px（与原观感一致），全程不再出现 0 宽度。
 */

const src = readFileSync(resolve(process.cwd(), "src/features/status-page.tsx"), "utf8");

/** 抽出状态横幅最外层那个 div 的 className 串 */
function bannerClass(): string {
  const i = src.indexOf('role="status"');
  expect(i, "未能定位状态横幅").toBeGreaterThan(-1);
  // className 在 role 之后
  const after = src.slice(i, i + 900);
  const m = after.match(/className=\{`([^`]*)`\}/);
  expect(m, "未能定位状态横幅的 className").toBeTruthy();
  return m![1];
}

describe("/status 状态横幅 · 窄屏必须能换行", () => {
  it("窄屏纵向堆叠、≥sm 才横排", () => {
    const cls = bannerClass();
    expect(cls, "缺少 flex-col：窄屏仍会把 图标 + 文案 + 两个按钮 挤在一行").toMatch(
      /(^|\s)flex-col(\s|$)/,
    );
    expect(cls, "缺少 sm:flex-row：宽屏应恢复单行横排").toContain("sm:flex-row");
    expect(cls, "缺少 sm:items-center：宽屏恢复纵向居中").toContain("sm:items-center");
  });

  it("不再残留「恒定单行」的写法", () => {
    const cls = bannerClass();
    expect(
      cls,
      "横幅又变成恒定单行 flex：窄屏文本块会被挤到 0px（实测 280~340px 就是 0）",
    ).not.toMatch(/(^|\s)flex items-center(\s|$)/);
  });

  it("图标与文案被包进同一个 flex-1 行容器，且按钮区能换行", () => {
    expect(
      src,
      "图标与文案没有包进 flex-1 容器：窄屏下它们会各自成为 flex 子项，文案仍会被压",
    ).toMatch(/flex min-w-0 flex-1 items-center gap-3/);
    const actions = src.match(/className="(flex shrink-0[^"]*items-center gap-2[^"]*)"/)?.[1];
    expect(actions, "未能定位横幅的动作按钮区").toBeTruthy();
    expect(actions!, "动作区缺少 flex-wrap：窄屏两个按钮会一起溢出").toContain("flex-wrap");
    expect(actions!, "动作区应在 ≥sm 才靠右").toContain("sm:ml-auto");
  });
});
