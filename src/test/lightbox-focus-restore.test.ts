import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 灯箱关闭后必须把焦点归还给打开它的那张瓦片（P97）。
 *
 * 灯箱是**受控 Dialog**：`<Dialog open={index !== null}>`，没有 DialogTrigger。
 * Radix 的「关闭后归还焦点」实现是记住 trigger 元素；拿不到 trigger 时
 * onCloseAutoFocus 未 preventDefault，焦点就退到 document.body。
 *
 * 用无头 Chrome 在真实构建产物上实测（先注入 `*{animation:none}` 排除
 * headless 不派发 animationend 造成的 Presence 假象）：
 *
 *   场景                              关闭后 activeElement
 *   灯箱（无 DialogTrigger）           BODY          ← 焦点丢失
 *   后台 AddImageDialog（有 Trigger）  「添加图片」按钮 ← 正确
 *
 * 也就是只有灯箱这条路径坏了：键盘用户在缩略图上按 Enter 打开大图、
 * 看完按 Esc/关闭，焦点掉回 body，Tab 要从整页最开头重走一遍，正在浏览的
 * 位置彻底丢失（WCAG 2.4.3 Focus Order）。
 *
 * 修法：灯箱自己在「打开的那一次渲染」记下 document.activeElement，
 * 通过 DialogContent 的 onCloseAutoFocus 归还；目标若已不在 DOM
 * （翻页/筛选换了一批图）则不阻止默认行为，交回 Radix。
 */

const SOURCE = readFileSync(
  resolve(process.cwd(), "src/components/ui/image-lightbox.tsx"),
  "utf8",
);

describe("灯箱 · 关闭后焦点归还到触发瓦片", () => {
  it("DialogContent 挂了 onCloseAutoFocus", () => {
    const dc = SOURCE.slice(SOURCE.indexOf("<DialogContent"), SOURCE.indexOf("</DialogContent>") === -1 ? undefined : SOURCE.indexOf("<DialogTitle"));
    expect(dc, "未能定位 DialogContent").toBeTruthy();
    expect(
      dc,
      "缺少 onCloseAutoFocus：受控 Dialog 没有 trigger，焦点会掉到 body",
    ).toContain("onCloseAutoFocus={handleCloseAutoFocus}");
  });

  it("打开时记录焦点元素，且排除 body 与弹层内元素", () => {
    expect(SOURCE, "未记录打开前的焦点元素").toMatch(/restoreFocusRef/);
    expect(SOURCE, "未排除 body：可能把 body 记成归还目标").toContain("active !== document.body");
    expect(SOURCE, "未排除已处于弹层内的元素").toContain('active.closest(\'[role="dialog"]\')');
    // 必须是渲染期记录：Radix 搬焦点在 commit 之后
    const idx = SOURCE.indexOf("if (isOpen !== wasOpenRef.current)");
    expect(idx, "焦点记录没有放在渲染期（useEffect 会晚于 Radix 搬焦点）").toBeGreaterThan(-1);
  });

  it("归还前校验目标仍在 DOM，避免 focus 抛错/落到已卸载节点", () => {
    const fn = SOURCE.slice(
      SOURCE.indexOf("const handleCloseAutoFocus"),
      SOURCE.indexOf("const image ="),
    );
    expect(fn, "未能定位 handleCloseAutoFocus").toBeTruthy();
    expect(fn).toContain("document.contains(target)");
    expect(fn, "归还前必须 preventDefault，否则 Radix 还会把焦点甩回 body").toContain(
      "event.preventDefault()",
    );
    expect(fn).toContain("target.focus()");
  });
});
