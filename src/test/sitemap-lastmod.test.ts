import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * sitemap.xml 的 <lastmod> 必须是构建时注入的真实日期。
 *
 * 背景：public/ 下的文件会被 Vite 原样拷进 dist/，所以写死在 XML 里的日期
 * 一眼就是旧的。而 Google 明确忽略 <priority> 与 <changefreq>，只把
 * <lastmod> 当成「要不要回来重抓」的信号 —— 图库每天都在收录新图，
 * 没有 lastmod 就只能等爬虫凭运气回来。
 *
 * 修法：XML 里写占位符，vite.config.ts 的 sitemap-lastmod 插件在构建结束时
 * 替换成构建日期，dev 下由中间件即时替换。
 *
 * 这里钉住三件在构建产物里能验的事：
 *   1. 每个 <url> 都有 <lastmod>，且是合法的 YYYY-MM-DD；
 *   2. 产物里不能残留占位符（漏替换 = 搜索引擎读到垃圾）；
 *   3. <lastmod> 数量必须等于 <loc> 数量 —— 注释里若出现占位符字面量，
 *      会被一并替换掉并造出多余的 <lastmod>，这条防的就是那个坑。
 */

const sitemapPath = resolve(process.cwd(), "public/sitemap.xml");
const distPath = resolve(process.cwd(), "dist/sitemap.xml");
const source = readFileSync(sitemapPath, "utf8");

describe("sitemap.xml · lastmod 注入", () => {
  it("每个 url 都带 lastmod 占位符，供构建时替换", () => {
    const locs = (source.match(/<loc>/g) ?? []).length;
    const placeholders = (source.match(/<lastmod>__LASTMOD__<\/lastmod>/g) ?? []).length;
    expect(locs).toBeGreaterThan(0);
    expect(placeholders, "每个 <url> 都应有一个占位符 lastmod").toBe(locs);
  });

  it("注释里不得出现占位符字面量（会被替换并造出多余的 lastmod）", () => {
    const inComment = /<!--[\s\S]*?__LASTMOD__[\s\S]*?-->/.test(source);
    expect(inComment, "注释含占位符字面量：替换后会污染注释并多出一个 lastmod").toBe(false);
  });

  it("vite.config.ts 注册了 sitemap-lastmod 插件", () => {
    const cfg = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");
    expect(cfg).toContain('name: "sitemap-lastmod"');
    expect(cfg).toMatch(/plugins:\s*\[[^\]]*sitemapLastmod\(\)/);
  });

  // 构建产物存在时才校验（CI 先 build 再 test 的场景）
  it.skipIf(!existsSync(distPath))("产物里 lastmod 已注入且数量与 loc 一致", () => {
    const dist = readFileSync(distPath, "utf8");
    expect(dist, "占位符未替换").not.toContain("__LASTMOD__");
    const locs = (dist.match(/<loc>/g) ?? []).length;
    const lastmods = (dist.match(/<lastmod>/g) ?? []).length;
    expect(lastmods, "lastmod 数量应与 loc 一一对应").toBe(locs);
    for (const m of dist.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
      expect(m[1], "lastmod 必须是 YYYY-MM-DD").toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
