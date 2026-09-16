// ============================================================
// Business API Functions
// ============================================================

import type { ImageRecord, Stats, PaginatedImages } from './types';
import { apiRequest } from './api-client';
import { canonicalizeImageUrl } from './helpers';

// ---- Public API ----

export async function fetchRandomImage(tag?: string): Promise<ImageRecord> {
  const params = new URLSearchParams();
  if (tag) params.set('tag', tag);
  params.set('format', 'json');
  const query = params.toString();
  return apiRequest<ImageRecord>(
    `/api/random${query ? `?${query}` : ''}`,
    undefined,
    '获取随机图片失败',
  );
}

/**
 * Fetch a random image but never throw: on API failure (HTML fallback,
 * network error, empty gallery) return a synthetic record so callers
 * always have something shaped like an ImageRecord.
 *
 * `fallbackUrl` defaults to an empty string, which means 「没有可用图片」.
 * Callers must treat an empty url as "no image" and render their own
 * empty/gradient state — never a broken <img>. 早期版本这里默认填了一个
 * 第三方文生图地址，实测只会返回「图片生成中」的占位图，因此已移除。
 */
export async function fetchRandomImageWithFallback(
  tag?: string,
  fallbackUrl = '',
): Promise<ImageRecord> {
  try {
    return await fetchRandomImage(tag);
  } catch {
    return {
      id: 'fallback',
      url: fallbackUrl,
      title: '派次元 API',
      tags: [],
      createdAt: new Date(0).toISOString(),
    };
  }
}

export async function fetchStats(): Promise<Stats> {
  return apiRequest<Stats>('/api/stats', undefined, '获取统计数据失败');
}

// ---- Gallery API ----

export async function fetchImagesPage(params: {
  page: number;
  pageSize: number;
  search?: string;
  tag?: string | null;
}): Promise<PaginatedImages> {
  const query = new URLSearchParams();
  query.set('page', String(params.page));
  query.set('pageSize', String(params.pageSize));

  const search = params.search?.trim();
  if (search) query.set('search', search);
  if (params.tag) query.set('tag', params.tag);

  // List queries are idempotent and paginated: skip the `_t` cache-buster so
  // edge/CDN caching can work. Freshness is handled by react-query instead.
  return apiRequest<PaginatedImages>(
    `/api/list?${query.toString()}`,
    undefined,
    '获取图片列表失败',
    { bustCache: false },
  );
}

/**
 * Fetch the full gallery URL set for batch-import dedup pre-checks.
 * Handles both the legacy bare-array shape and the paginated `{items}` shape.
 * Gallery is small (<500), so one request is cheap.
 */
export async function fetchExistingImageUrlSet(): Promise<Set<string>> {
  const body = await apiRequest<ImageRecord[] | PaginatedImages>(
    '/api/list',
    undefined,
    '获取已有图片地址失败',
  );
  const records = Array.isArray(body) ? body : (body.items ?? []);
  const set = new Set<string>();
  for (const record of records) {
    const canonical = canonicalizeImageUrl(record.url ?? '');
    if (canonical) set.add(canonical);
  }
  return set;
}

// ---- Admin API ----

export async function verifyAdminToken(adminToken: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>(
    '/api/admin/verify',
    { headers: { Authorization: `Bearer ${adminToken}` } },
    '管理密钥校验失败',
  );
}

function getAdminHeaders(adminToken: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminToken}`,
  };
}

export async function createImage(
  data: { url: string; title: string; tags: string[] },
  adminToken: string,
): Promise<ImageRecord> {
  return apiRequest<ImageRecord>(
    '/api/create',
    { method: 'POST', headers: getAdminHeaders(adminToken), body: JSON.stringify(data) },
    '添加图片失败',
  );
}

export async function updateImage(
  id: string,
  data: { url?: string; title?: string; tags?: string[] },
  adminToken: string,
): Promise<ImageRecord> {
  return apiRequest<ImageRecord>(
    `/api/update/${id}`,
    { method: 'PUT', headers: getAdminHeaders(adminToken), body: JSON.stringify(data) },
    '更新图片失败',
  );
}

export async function deleteImage(id: string, adminToken: string): Promise<void> {
  await apiRequest<{ success: boolean }>(
    `/api/delete/${id}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } },
    '删除图片失败',
  );
}

export async function batchCreateImages(
  images: Array<{ url: string; title: string; tags: string[] }>,
  adminToken: string,
): Promise<{
  total: number;
  success: number;
  failed: number;
  results: Array<{ success: boolean; url: string; id?: string; error?: string }>;
}> {
  return apiRequest(
    '/api/batch',
    { method: 'POST', headers: getAdminHeaders(adminToken), body: JSON.stringify({ images }) },
    '批量添加图片失败',
  );
}
