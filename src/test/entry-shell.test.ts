import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
const indexHtml = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const cssSource = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
/**
 * 入口层（index.html 空 root + main.tsx 崩溃兜底 + sonner Toaster）的一致性。
 *
 * P15–P20 的玻璃拟态 / 旧冷灰调色板清理只扫描了 src/components 目录，
 * **漏掉了入口层**。于是出现了 Toaster 与入口兜底不在设计语言里的残留。
 * 这组测试保证运行时兜底仍保持统一视觉，同时确认 index.html 不再把加载提示
 * 当作页面内容渲染出来。
 */
describe("入口层与设计语言一致", () => {
  describe("sonner Toaster 不得使用玻璃拟态", () => {
    it("不再有 backdrop-filter", () => {
      // 只匹配真正的样式声明（属性名带冒号），避免命中注释里的说明文字。
      expect(mainSource).not.toMatch(/backdropFilter\s*:|backdrop-filter\s*:/);
    });

    it("用实色白底 + 墨线 + 硬投影", () => {
      expect(mainSource).toContain('background: "#ffffff"');
      expect(mainSource).toContain('border: "2px solid #15171f"');
      expect(mainSource).toContain('boxShadow: "4px 4px 0 0 #15171f"');
    });

    it("不再有半透明底 / 柔光投影", () => {
      expect(mainSource).not.toContain("rgba(255,255,255,0.9)");
      expect(mainSource).not.toContain("rgba(11,18,32,0.12)");
    });
  });

  describe("入口占位", () => {
    it("不渲染会被误认为页面内容的加载提示", () => {
      expect(indexHtml).not.toContain("页面正在加载");
      expect(indexHtml).not.toContain("如果长时间停留在这里");
      expect(indexHtml).toMatch(/<div id="root"><\/div>/);
    });
  });

  describe("index.css 不留死动效 token", () => {
    it("已退场的 keyframes / 动画 token 不再定义", () => {
      for (const dead of [
        "--animate-accordion-down",
        "--animate-accordion-up",
        "--animate-slide-up",
        "--animate-shimmer",
        "--animate-float",
        "--animate-pulse-glow",
      ]) {
        expect(cssSource).not.toContain(dead);
      }
      for (const dead of [
        "@keyframes accordion-down",
        "@keyframes accordion-up",
        "@keyframes slide-up",
        "@keyframes float",
        "@keyframes pulse-glow",
      ]) {
        expect(cssSource).not.toContain(dead);
      }
    });

    it("仍保留真正有调用点的 keyframes", () => {
      expect(cssSource).toContain("@keyframes fade-in");
      expect(cssSource).toContain("@keyframes shimmer");
      expect(cssSource).toContain("@keyframes count-up");
      expect(cssSource).toContain("--animate-fade-in");
    });

    it("减弱动效关闭列表只剩存活类", () => {
      const reduceBlock = cssSource.slice(cssSource.indexOf("prefers-reduced-motion: reduce"));
      expect(reduceBlock).toContain(".animate-fade-in");
      expect(reduceBlock).toContain(".stat-value");
      expect(reduceBlock).toContain(".skeleton-shimmer");
      // Radix 弹层（对话框/下拉/灯箱）的 animate-in/out 工具类也必须在闸内，
      // 否则减动效偏好下删图确认框照样飞入。
      //
      // 必须断言「按 class 子串匹配」的写法：Radix 元素上的类名实际是变体形式
      // （data-[state=open]:animate-in、data-[state=closed]:animate-out），
      // 裸 .animate-in / .animate-out 选不到它们。这里原先只断言字面量存在，
      // 于是那条死规则（裸类名）也能让测试通过 —— 实测减弱动效下弹层的
      // animationName 仍是 enter。断言子串选择器才能钉住真行为。
      expect(reduceBlock).toContain('[class*="animate-in"]');
      expect(reduceBlock).toContain('[class*="animate-out"]');
      // 裸类名规则不得复活（注释里提到它没问题，只拦真正的选择器行）
      const reduceLines = reduceBlock.split(/\r?\n/).map((l) => l.trim());
      expect(reduceLines).not.toContain(".animate-in,");
      expect(reduceLines).not.toContain(".animate-out {");
      for (const dead of [
        ".animate-slide-up",
        ".animate-shimmer",
        ".animate-float",
        ".animate-pulse-glow",
      ]) {
        expect(reduceBlock).not.toContain(dead);
      }
    });
  });

  describe("骨架屏改用暖纸中性 token", () => {
    /**
     * P15–P21 换色板时只扫了十六进制字面量，漏掉了 .skeleton-shimmer 里
     * 以 rgb() 分量写的旧冷灰（rgba(228,232,239,…) / rgba(247,248,250,…)）。
     * 这组值正是入口层早已废弃的冷灰调色板（#E4E8EF / #F7F8FA），
     * 也是全站最后一处「不在暖纸底语言里」的残留。
     *
     * 注意：断言只针对 rgb() 分量写法，不针对十六进制 —— 因为 index.css 里
     * 的 `.dark` 暗色占位块仍保留同族冷灰字面值（全站锁浅色的未来预留）。
     * 原 `--color-sidebar-*` 一组同名冷灰已因零引用删除。
     * 一刀切地禁 hex 会误伤暗色占位块，故维持只禁 rgb() 分量。
     */
    it("不再出现旧冷灰的 rgb 分量写法", () => {
      expect(cssSource).not.toContain("228, 232, 239");
      expect(cssSource).not.toContain("247, 248, 250");
      // 墨色 #15171f 的同族守卫：阴影与 .browser-dot 曾长期写 rgba(11,18,32,…)
      // （旧冷灰 #0b1220 的分量形式），P31 已统一到墨色分量 21, 23, 31。
      expect(cssSource).not.toContain("11, 18, 32");
    });

    it("底色改引 --color-border / --color-background", () => {
      const block = cssSource.slice(cssSource.indexOf(".skeleton-shimmer {"));
      expect(block).toContain("var(--color-border)");
      expect(block).toContain("var(--color-background)");
    });
  });
});
