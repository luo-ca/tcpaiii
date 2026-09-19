import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@/lib/api-client';

/**
 * apiRequest 的 EdgeOne 预览参数契约。
 *
 * 站点用 `?eo_token=…` 预览部署（url.ts 的 appendCurrentPreviewParams 为此而生，
 * gallery-query.test.ts 也锁过「eo_token 被抹掉 = 预览链接当场失效」这条契约）。
 * 但 apiRequest 原先只给「带 _t 破缓的 GET」补预览参数：
 *   · stats / 分页 list（bustCache:false）裸发；
 *   · 全部 POST/PUT/DELETE 写请求裸发。
 * 结果预览链接上：随机 GET 打预览函数，stats/list/写入却打到线上 —— 页面显示
 * 线上数据、管理员一点「添加」就写进生产库。这里钉住「所有请求都带参」。
 */

const PREVIEW_SEARCH = '?eo_token=preview-token-42&eo_time=1700000000';

function stubPreviewWindow() {
  vi.stubGlobal('window', {
    location: {
      origin: 'https://preview.example.test',
      pathname: '/gallery',
      search: PREVIEW_SEARCH,
      hash: '',
    },
  });
}

function stubFetchCapture() {
  const calls: Array<RequestInfo | URL> = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    calls.push(input);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
    });
  });
  return calls;
}

function requestedUrl(input: RequestInfo | URL): URL {
  return new URL(String(input), 'https://preview.example.test');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiRequest 预览参数契约', () => {
  it('bustCache:false 的 GET（stats/list）也带上 eo_token/eo_time，且仍不加 `_t`', async () => {
    stubPreviewWindow();
    const calls = stubFetchCapture();

    await apiRequest('/api/stats', undefined, '获取统计数据失败', { bustCache: false });

    const url = requestedUrl(calls[0]);
    expect(url.searchParams.get('eo_token')).toBe('preview-token-42');
    expect(url.searchParams.get('eo_time')).toBe('1700000000');
    expect(url.searchParams.has('_t')).toBe(false);
  });

  it('非 GET 写请求同样保住预览参数', async () => {
    stubPreviewWindow();
    const calls = stubFetchCapture();

    await apiRequest(
      '/api/create',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      '添加图片失败',
    );

    const url = requestedUrl(calls[0]);
    expect(url.searchParams.get('eo_token')).toBe('preview-token-42');
    // 写请求从不被缓存，不需要破缓参数
    expect(url.searchParams.has('_t')).toBe(false);
  });

  it('破缓 GET 依旧同时带 eo_token 与 `_t`（回归闸）', async () => {
    stubPreviewWindow();
    const calls = stubFetchCapture();

    await apiRequest('/api/random?tag=acg', undefined, '获取随机图片失败');

    const url = requestedUrl(calls[0]);
    expect(url.searchParams.get('eo_token')).toBe('preview-token-42');
    expect(url.searchParams.has('_t')).toBe(true);
  });

  it('非预览链接（无 eo 参数）时 URL 不被污染（回归闸）', async () => {
    vi.stubGlobal('window', {
      location: { origin: 'https://t.paiii.cn', pathname: '/', search: '', hash: '' },
    });
    const calls = stubFetchCapture();

    await apiRequest('/api/stats', undefined, '获取统计数据失败', { bustCache: false });
    expect(String(calls[0])).toBe('/api/stats');

    await apiRequest('/api/create', { method: 'POST', body: '{}' }, '添加图片失败');
    expect(String(calls[1])).toBe('/api/create');
  });
});
