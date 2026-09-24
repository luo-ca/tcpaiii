import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * BackToTop 的行为契约（P157）。
 *
 * 这个组件此前**没有任何测试**。它的失败模式很隐蔽：不报错、不崩，
 * 只是「滚到底了却没出现按钮」或「点了没反应」——用户不会报 bug，
 * 只会觉得这站长页面翻回去很费劲。
 *
 * 实测确认源码逻辑正确（阈值 / 事件监听 / 平滑滚动都在），
 * 本测试把这些契约钉住，防止后续改动（换滚动容器、改阈值、
 * 误加 preventDefault）悄悄破坏它。
 *
 * 顺带记录一个环境坑：**iframe 里无法驱动内部页面滚动**
 * （scrollTo / scrollTop / WheelEvent 全部无效，实测 scrollY 恒为 0；
 * 同样的代码在独立页面里正常）。所以这类滚动行为只能靠源码契约测试，
 * 不要试图用 iframe 探针验证，那会得到假失败。
 */

const SRC = readFileSync(resolve(process.cwd(), "src/components/ui/back-to-top.tsx"), "utf8");

describe("BackToTop 行为契约（P157）", () => {
  it("有明确的显示阈值常量，不是散落的魔法数字", () => {
    expect(SRC).toMatch(/const SHOW_AFTER_PX\s*=\s*\d+/);
    expect(SRC, "阈值未被用于比较").toMatch(/SHOW_AFTER_PX/);
  });

  it("滚动超过阈值才显示（用 scrollY 比较，不是 scrollTop）", () => {
    expect(SRC).toMatch(/window\.scrollY\s*>\s*SHOW_AFTER_PX/);
  });

  it("监听 scroll 且用 passive（不阻塞滚动）", () => {
    expect(SRC).toMatch(/addEventListener\(\s*['"]scroll['"]/);
    expect(SRC, "缺 passive: true 会在滚动时增加主线程负担").toMatch(/passive:\s*true/);
  });

  it("卸载时移除监听（路由切换会重建组件，不移除会泄漏）", () => {
    expect(SRC).toMatch(/removeEventListener\(\s*['"]scroll['"]/);
  });

  it("挂载时先读一次当前滚动位置（刷新/回退到已滚动页面时状态正确）", () => {
    // 不能只依赖 scroll 事件：direct load 到已滚动位置不会再触发 scroll
    const effectBlock = SRC.slice(SRC.indexOf("useEffect"), SRC.indexOf("handleClick"));
    expect(effectBlock, "缺初次读取，刷新后会短暂不显示按钮").toMatch(/handleScroll\(\)/);
  });

  it("点击回到顶部；且尊重 prefers-reduced-motion", () => {
    expect(SRC).toMatch(/scrollTo\(\s*\{[^}]*top:\s*0/);
    expect(SRC, "显式 smooth 会绕过 CSS 的 reduced-motion 降级").toMatch(/prefersReducedMotion/);
  });

  it("按钮有可访问名与 title（读屏与悬停提示）", () => {
    expect(SRC).toMatch(/aria-label="回到顶部"/);
    expect(SRC).toMatch(/title="回到顶部"/);
  });

  it("z-index 低于弹层，灯箱打开时不会浮在图上", () => {
    expect(SRC, "z-40 必须低于弹层的 z-50").toMatch(/z-40/);
  });

  it("未达阈值时不渲染（短页面不出现多余按钮）", () => {
    expect(SRC).toMatch(/if\s*\(!visible\)\s*return\s+null/);
  });
});