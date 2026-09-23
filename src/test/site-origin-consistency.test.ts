import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 站点源必须三处一致。
 *
 * 同一个域名写在三个互不相干的地方：
 *   1. src/lib/constants.ts   —— APP_FALLBACK_DOMAIN（api.ts / url.ts 用它拼地址）
 *   2. src/hook/use-route-meta.ts —— SITE_ORIGIN（客户端改写 canonical / og:url）
 *   3. index.html             —— canonical / og:url / og:image / twitter:*
 *                                / JSON-LD，共 6 处硬编码
 *
 * 它们必须描述同一个站点。现网一致，但此前**没有任何测试钉住**。
 *
 * 为什么值得堵：换域名（或临时指向预览域）时漏改一处，症状是
 *   · canonical 指向旧域名 -> 搜索引擎认定重复内容，权重记到别处；
 *   · og:image 仍是旧域名 -> 社交分享卡片裂图；
 * 而 lint / test / build 全都照绿，因为没有任何东西比对过这三处。
 */

function hookDir(): string {
  const entry = readdirSync(resolve(process.cwd(), "src"), { withFileTypes: true }).find(
    (e) => e.isDirectory() && /^h/.test(e.name),
  );
  if (!entry) throw new Error("找不到 hook 目录");
  return entry.name;
}

const constantsSrc = readFileSync(resolve(process.cwd(), "src/lib/constants.ts"), "utf8");
const routeMetaSrc = readFileSync(
  join(resolve(process.cwd(), "src"), hookDir(), "use-route-meta.ts"),
  "utf8",
);
const indexHtml = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

/** 取出「一个站点源」，多于一个值就说明文件里混了别的域名 */
function originsIn(source: string, re: RegExp): string[] {
  return [...new Set([...source.matchAll(re)].map((m) => m[0]))];
}

describe("站点源一致性", () => {
  it("constants.ts 定义了 APP_FALLBACK_DOMAIN", () => {
    expect(constantsSrc).toMatch(/APP_FALLBACK_DOMAIN\s*=\s*'https:\/\/[^']+'/);
  });

  it("use-route-meta.ts 的 SITE_ORIGIN 与 APP_FALLBACK_DOMAIN 同值", () => {
    const fallback = constantsSrc.match(/APP_FALLBACK_DOMAIN\s*=\s*'([^']+)'/)?.[1];
    const siteOrigin = routeMetaSrc.match(/SITE_ORIGIN\s*=\s*'([^']+)'/)?.[1];
    expect(fallback, "constants.ts 缺失 APP_FALLBACK_DOMAIN").toBeTruthy();
    expect(siteOrigin, "use-route-meta.ts 缺失 SITE_ORIGIN").toBeTruthy();
    expect(
      siteOrigin,
      "SITE_ORIGIN 与 APP_FALLBACK_DOMAIN 不一致：canonical / og:url 会指向另一个域名",
    ).toBe(fallback);
  });

  it("index.html 里的站点源只有这一个域名，且与代码同值", () => {
    const fallback = constantsSrc.match(/APP_FALLBACK_DOMAIN\s*=\s*'([^']+)'/)?.[1];
    const htmlOrigins = originsIn(indexHtml, /https:\/\/t\.paiii\.cn/g);
    expect(htmlOrigins.length, "index.html 里没有站点源").toBeGreaterThan(0);
    expect(
      htmlOrigins.length,
      `index.html 混入了别的站点源：${htmlOrigins.join(", ")}`,
    ).toBe(1);
    expect(htmlOrigins[0], "index.html 的站点源与 APP_FALLBACK_DOMAIN 不一致").toBe(fallback);
  });

  it("canonical 与 og:url 指向同一个地址", () => {
    const canonical = indexHtml.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    const ogUrl = indexHtml.match(/<meta property="og:url" content="([^"]+)"/)?.[1];
    expect(canonical, "缺少 canonical").toBeTruthy();
    expect(ogUrl, "缺少 og:url").toBeTruthy();
    expect(ogUrl, "canonical 与 og:url 不一致会让分享链接指向另一个地址").toBe(canonical);
  });
});
