import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * edgeone.json 是全站唯一的响应头出口（安全头 + 静态资源缓存策略），
 * 而它在本地开发里完全「不可见」——只有部署后才生效，写坏了 CI 也发现不了。
 * 这里把它当代码一样钉住。
 */

type HeaderRule = { source: string; headers: Array<{ key: string; value: string }> };

const config = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../edgeone.json', import.meta.url)), 'utf8'),
) as {
  rewrites: Array<{ source: string; destination: string }>;
  headers: HeaderRule[];
};

function headerMapFor(source: string): Record<string, string> {
  const rule = config.headers.find((item) => item.source === source);
  return Object.fromEntries((rule?.headers ?? []).map((h) => [h.key, h.value]));
}

describe('edgeone.json', () => {
  it('keeps the SPA fallback rewrite that the hand-rolled router depends on', () => {
    const fallback = config.rewrites.find((r) => r.source === '/*');
    expect(fallback?.destination).toBe('/index.html');
  });

  it('serves baseline security headers on every response', () => {
    const global = headerMapFor('/*');
    expect(global['X-Content-Type-Options']).toBe('nosniff');
    expect(global['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(global['X-Frame-Options']).toBe('SAMEORIGIN');
    expect(global['Permissions-Policy']).toContain('camera=()');
    const csp = global['Content-Security-Policy'];
    expect(csp).toBeDefined();
    // CSP 必须同时放行本站模块与 WAF 反调试脚本，缺一个就是自断功能
    expect(csp).toContain("script-src 'self' https://imgs.paiii.cn");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("object-src 'none'");
  });

  it('caches hashed build assets immutably and the html shell not at all', () => {
    expect(headerMapFor('/assets/*')['Cache-Control']).toBe('public, max-age=31536000, immutable');
    expect(headerMapFor('/index.html')['Cache-Control']).toBe('no-cache');
  });

  /**
   * /admin 必须带 X-Robots-Tag 响应头。
   *
   * robots.txt 里 Disallow: /admin 只是「别爬」，而页面自己的
   * <meta name="robots" content="noindex"> 是 use-route-meta.ts 在客户端用 JS 写进去的。
   * 两者冲突：既然禁止爬取，爬虫就不会执行 JS，也就永远读不到那个 noindex。
   * 而 /admin 在页脚有链接（JS 渲染后），URL 照样能被发现 —— 这正是搜索
   * 引擎文档里点名的反模式：Disallow 挡掉了 noindex 生效的机会。
   *
   * X-Robots-Tag 是响应头，不经爬取即可生效，是这个场景的标准答案。
   */
  describe('/admin 反索引', () => {
    it('带 X-Robots-Tag: noindex, nofollow', () => {
      const admin = headerMapFor('/admin');
      expect(admin['X-Robots-Tag']).toBe('noindex, nofollow');
    });

    it('规则排在 /* 之前，且不与全站安全头冲突', () => {
      const idxAdmin = config.headers.findIndex((h) => h.source === '/admin');
      const idxGlobal = config.headers.findIndex((h) => h.source === '/*');
      expect(idxAdmin, '缺少 /admin 规则').toBeGreaterThanOrEqual(0);
      expect(idxAdmin, '/admin 规则应排在 /* 之前').toBeLessThan(idxGlobal);
      // 全站安全头不能被这条替换掉
      const global = headerMapFor('/*');
      expect(global['X-Content-Type-Options']).toBe('nosniff');
      expect(global['Content-Security-Policy']).toContain("default-src 'self'");
    });

    it('所有规则都符合 EdgeOne 的字段约束', () => {
      // 约束抄自 edgeone 本地包里真正的校验器
      // (edgeone-dist/pages/dev/runner-worker.js 的 ESe / wSe / f_)，不是凭印象写的：
      //   key   : 1..100，仅 [a-zA-Z0-9-]
      //   value : 1..1000，且平台明确禁止出现中文字符
      //   source: 1..500，字符集受限，通配符 * 最多一个
      for (const rule of config.headers) {
        expect(rule.source.length, 'source 不能为空').toBeGreaterThan(0);
        expect(rule.source.length, 'source 超过 500 字符').toBeLessThanOrEqual(500);
        expect(rule.source, 'source 含非法字符').not.toMatch(/[^a-zA-Z0-9_\-/:*.~=?#!$&+,;%@ ]/);
        expect((rule.source.match(/\*/g) ?? []).length, 'source 最多一个 *').toBeLessThanOrEqual(1);

        for (const h of rule.headers) {
          expect(h.key, 'header key 只能字母数字与连字符').toMatch(/^[a-zA-Z0-9-]+$/);
          expect(h.key.length, 'key 超过 100 字符').toBeLessThanOrEqual(100);
          expect(h.value.length, 'value 不能为空').toBeGreaterThan(0);
          expect(h.value.length, 'value 超过 1000 字符').toBeLessThanOrEqual(1000);
          expect(h.value, 'value 不得含中文字符').not.toMatch(/[\u4e00-\u9fa5]/);
        }
      }
      expect(config.headers.length, '规则条数上限 100').toBeLessThanOrEqual(100);
    });
  });
});
