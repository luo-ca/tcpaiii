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
 *
 * 【P137 补充】原先只扫**内容**，不扫**路径名**。而路径名被污染后果更重：
 * 内容里的同形字顶多让某个类名失效；路径名里的会让 `grep hook`、`git mv`、
 * CI 的路径匹配、构建缓存 key 一起失灵，且同样肉眼看不出来。
 * 实测确认过 `src/hook/` 只是**终端把它显示成了西里尔字形**，
 * 磁盘上的真实字节是 `686f6f6b`（ASCII "hook"）—— 但这恰恰说明
 * 「看起来是坏名字」与「真是坏名字」无法靠肉眼区分，必须让测试去查字节。
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

/**
 * 递归收集所有**路径名**（目录与文件，不只匹配扩展名）。
 * 与 walk 分开：walk 只挑源码文件，这里要覆盖全部条目 —— 一个被污染的
 * 目录名或 README 之类都可能躲过 walk 的扩展名过滤。
 */
function walkNames(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // 目录不存在（如未构建的产物目录）直接跳过
  }
  for (const entry of entries) {
    if (["node_modules", "dist", ".git", "release"].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    out.push(full);
    if (entry.isDirectory()) walkNames(full, out);
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

  /**
   * 路径名同样要查（P137 补）。
   *
   * 原先这道护栏只看文件**内容**，路径名是盲区。而路径名被污染更难收拾：
   * 内容里的一个同形字顶多让某条规则失效，名字里的会让 grep / git mv /
   * CI 路径匹配 / 构建缓存 key 一起失灵，且同样肉眼看不出来。
   *
   * 注意判定用**码点**而不是「是不是 ASCII」：中文文件名（如文档）本身合法，
   * 真正要拦的是「本意是 ASCII、却混进了西里尔同形字」这类。所以只对
   * 落在 U+0400–U+04FF（西里尔）与零宽区间的码点报错。
   */
  it("文件与目录名里没有零宽字符或西里尔同形字", () => {
    const offenders: string[] = [];
    for (const root of ["src", "edge-functions-src", "public", "edge-functions"]) {
      for (const name of walkNames(resolve(process.cwd(), root))) {
        if (ZERO_WIDTH.test(name) || CYRILLIC.test(name)) {
          offenders.push(name.replace(process.cwd(), "").replace(/\\/g, "/"));
        }
      }
    }
    expect(
      offenders,
      "路径名含西里尔同形字/零宽字符 —— 肉眼极难发现，却会破坏 grep、git mv 与 CI 路径匹配",
    ).toEqual([]);
  });
});
