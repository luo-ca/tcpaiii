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
});
