import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 外链安全属性（P169）。
 *
 * `target="_blank"` 打开的页面能通过 `window.opener` 反向操作本页
 * （把用户从 t.paiii.cn 替换成钓鱼页）。`rel="noopener"` 切断这条引用；
 * `rel="noreferrer"` 另外不带 Referer。
 *
 * 现状审计（本轮实测）：全站 8 处 `target="_blank"`，7 处写的是
 * `noopener noreferrer`，1 处（ImageSubmission 的「前往投稿」）只写了
 * `noreferrer`。现代浏览器下 `noreferrer` 已隐含 `noopener`，所以那不是
 * 漏洞 —— 但它和其余 7 处不一致，而且旧版浏览器不隐含。已对齐。
 *
 * 为什么值得用测试钉：`rel` 写错/漏写在界面上**完全看不出来**，
 * 只在真正被利用时才暴露 —— 靠人肉 review 抓不住。
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

const sources = walk(resolve(process.cwd(), "src"));

describe("外链 · target=_blank 必须带 noopener", () => {
  it("每一处 target=\"_blank\" 都配了 rel=\"noopener ...\"", () => {
    const offending: string[] = [];
    let total = 0;
    for (const file of sources) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!/target=["']_blank["']/.test(line)) return;
        total += 1;
        // rel 可能写在同一行，也可能在相邻几行（多行 JSX 属性）
        const context = lines.slice(Math.max(0, i - 3), i + 4).join(" ");
        const hasNoopener =
          /rel=["'][^"']*noopener[^"']*["']/.test(context);
        if (!hasNoopener) {
          offending.push(
            file.replace(process.cwd(), "").replace(/\\/g, "/") + ":" + (i + 1),
          );
        }
      });
    }
    expect(total, "一处 target=_blank 都没找到，选择器可能失效了").toBeGreaterThan(0);
    expect(
      offending,
      "以下外链缺少 rel=\"noopener\"：打开的页面可以反向操作本页",
    ).toEqual([]);
  });

  it("不用 javascript: 协议做 href（XSS 面）", () => {
    const offending: string[] = [];
    for (const file of sources) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        // 只查真实属性用法，放过注释里的说明性文本
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        if (/(href|to)\s*=\s*["']javascript:/i.test(line)) {
          offending.push(
            file.replace(process.cwd(), "").replace(/\\/g, "/") + ":" + (i + 1),
          );
        }
      });
    }
    expect(offending, "存在 javascript: 协议的链接").toEqual([]);
  });

  it("不用 dangerouslySetInnerHTML（唯一的 innerHTML 是入口兜底页，已转义）", () => {
    const offending: string[] = [];
    for (const file of sources) {
      const text = readFileSync(file, "utf8");
      // 入口兜底页会往 #root 写错误信息，但已做 HTML 转义（见 main.tsx）。
      // 这里只禁止 React 的 dangerouslySetInnerHTML 与裸 eval。
      if (/dangerouslySetInnerHTML/.test(text)) offending.push(file);
      if (/\beval\s*\(/.test(text) || /new Function\s*\(/.test(text)) offending.push(file);
    }
    expect(offending, "存在危险的 HTML/代码注入入口").toEqual([]);
  });
});
