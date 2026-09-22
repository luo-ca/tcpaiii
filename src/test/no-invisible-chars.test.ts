import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 源码里不得出现零宽字符或西里尔字母冒充 ASCII。
 *
 * 起因（真实踩到）：P67 我给批量改标签弹窗加了一行
 *     <p role="alert" className="text-xs font-medium text-destructive-ink">
 * class 名是从一次**终端输出**里复制过来的，而这份输出把
 * text-destructive-ink 显示成了带零宽空格(U+200B)与西里尔字母
 * (е U+0435 / с U+0441) 的样子 —— 我照着显示复制，就把这些不可见字符
 * 一起写进了源码：
 *     74 65 78 74 2d 64 435 73 200b 74 ... 441 ... 435
 *
 * 当时它「看起来能用」：Tailwind 会把这类类名归一化后生成对应的
 * .text-destructive-ink 规则，样式照样生效。正因为不影响渲染，
 * 这种污染才格外难发现 —— 它会在别的工具链上突然发作
 * （grep 不到、类名匹配失败、diff 里看不见）。
 *
 * 全仓扫过一遍：只有那一处，已修。这条测试防止再犯。
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", ".git", "release"].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs|json|css|html)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const ZERO_WIDTH = /[\u200b-\u200f\ufeff]/;
const CYRILLIC = /[\u0400-\u04ff]/;

describe("源码不得混入不可见/同形字符", () => {
  // 排除本文件自身：它的说明文字里必须引用那些不可见字符本身
  // （否则没法解释在防什么）—— 那属于「为了描述问题而出现」，
  // 不是被污染的源码。其余所有文件一律纳入。
  const SELF = resolve(process.cwd(), "src/test/no-invisible-chars.test.ts");
  const files = walk(resolve(process.cwd(), "src"))
    .concat(walk(resolve(process.cwd(), "edge-functions-src")))
    .filter((file) => resolve(file) !== SELF);

  /**
   * 除了源码，还要盯住**真正发出去的东西**：
   *   · index.html / edgeone.json —— 入口与部署配置
   *   · public/*                —— 会被原样拷进 dist 的静态文件
   *   · edge-functions/*        —— 编译产物，直接跑在边缘
   * 这些是用户/爬虫实际拿到手的字节。源码干净但产物脏，等于白扫。
   */
  const shipped = [
    "index.html",
    "edgeone.json",
    resolve(process.cwd(), "public/sitemap.xml"),
    resolve(process.cwd(), "public/robots.txt"),
    ...walk(resolve(process.cwd(), "edge-functions")),
    ...walk(resolve(process.cwd(), "public")),
  ].map((f) => resolve(f));

  it("src 与 edge-functions-src 下没有零宽字符或西里尔字母", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      text.split("\n").forEach((line, index) => {
        if (ZERO_WIDTH.test(line) || CYRILLIC.test(line)) {
          offenders.push(`${file.replace(/\\/g, "/")}:${index + 1}`);
        }
      });
    }
    expect(
      offenders,
      "含零宽字符/西里尔同形字 —— 通常是复制了终端显示结果，肉眼不可见但会破坏类名匹配",
    ).toEqual([]);
  });

  it("入口文件与部署产物同样干净", () => {
    const offenders: string[] = [];
    for (const file of shipped) {
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue; // 产物可能还没构建
      }
      text.split("\n").forEach((line, index) => {
        if (ZERO_WIDTH.test(line) || CYRILLIC.test(line)) {
          offenders.push(`${file.replace(/\\/g, "/")}:${index + 1}`);
        }
      });
    }
    expect(offenders, "发布产物含不可见/同形字符").toEqual([]);
  });
});
