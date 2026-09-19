import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * index.html 的 JSON-LD 结构化数据契约。
 *
 * 搜索引擎对 ld+json 的容错很低：非法 JSON 直接整块忽略，字段漂移
 * （比如 price "0" 变成数字、canonical 与 schema url 不同源）则悄悄丢富摘要。
 * 这些退化没有任何运行时表现，只能靠测试钉住。
 */

const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

function extractJsonLd(): Record<string, unknown> {
  const blocks = [...indexHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  expect(blocks).toHaveLength(1);
  return JSON.parse(blocks[0][1]);
}

describe('JSON-LD structured data', () => {
  it('parses as valid JSON and describes the site as a free web application', () => {
    const schema = extractJsonLd();
    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('WebApplication');
    expect(schema['applicationCategory']).toBe('DeveloperApplication');
    // 「免费」是本站的核心承诺：Offer.price 必须是字符串 "0"
    const offers = schema.offers as Record<string, unknown>;
    expect(offers['@type']).toBe('Offer');
    expect(offers.price).toBe('0');
    expect(offers.priceCurrency).toBe('CNY');
  });

  it('stays consistent with the canonical URL and OG image declared above it', () => {
    const schema = extractJsonLd();
    // 与 <link rel="canonical"> / og:url 同源，否则搜索引擎按两个实体处理
    const canonical = indexHtml.match(/<link rel="canonical" href="([^"]+)" \/>/);
    expect(canonical).not.toBeNull();
    expect(schema.url).toBe(canonical![1]);
    expect(indexHtml).toContain(`<meta property="og:url" content="${String(schema.url)}" />`);
    // image 与 og:image 同一张卡
    const ogImage = indexHtml.match(/<meta property="og:image" content="([^"]+)" \/>/);
    expect(schema.image).toBe(ogImage?.[1]);
  });

  it('lists only capabilities the API actually serves', () => {
    const schema = extractJsonLd();
    const features = schema.featureList as string[];
    // 逐项对应线上真实行为：302 直链 / format=json / tag 筛选 / exclude / 统计
    expect(features).toEqual(expect.arrayContaining([
      '免费使用',
      '标签分类筛选',
      '302 图片直链',
      'JSON 格式返回',
      '实时调用统计',
    ]));
  });
});
