// ============================================================
// Business API Functions
// ============================================================

import type { HealthPayload, ImageRecord, Stats, PaginatedImages } from './types';
import { apiRequest } from './api-client';
import { buildApiPath } from './url';
import { canonicalizeImageUrl } from './helpers';

// ---- Public API ----

export async function fetchRandomImage(tag?: string, exclude?: string): Promise<ImageRecord> {
  const params = new URLSearchParams();
  if (tag) params.set('tag', tag);
  // 「换一张」时带上上一张的 id，后端在同标签还有别的图时保证不撞回它
  if (exclude) params.set('exclude', exclude);
  params.set('format', 'json');
  const query = params.toString();
  return apiRequest<ImageRecord>(
    `/api/random${query ? `?${query}` : ''}`,
    undefined,
    '获取随机图片失败',
  );
}

/**
 * 服务健康检查。状态页专用 —— 不读 KV 之外的数据，也不计入 stats（后端
 * health 分支只回 runtime/buildId/kv 绑定），所以点「重新检查」不会污染调用量。
 */
export async function fetchHealth(): Promise<HealthPayload> {
  // no-store 破缓：状态页的本职就是「现在、此刻真的可用吗」，
  // 拿 5 分钟前的边缘缓存自证等于没测
  const body = await apiRequest<Partial<HealthPayload>>(
    '/api/health',
    undefined,
    '健康检查失败',
  );

  // 归一化 kv。状态页在**渲染期**调 deriveOverall()，里面直接读
  // health.kv.imagesBound —— 一旦响应缺 kv（或 kv 为 null），
  // 那里会抛 'Cannot read properties of undefined (reading imagesBound)'，
  // 整页崩掉。状态页恰恰是「服务挂了时用户来看」的页面，
  // 它自己崩掉是最糟的结果。缺字段时按「未绑定」处理，
  // 页面会显示降级/不可用，而不是白屏。
  const kv = (body?.kv ?? {}) as HealthPayload['kv'];
  return {
    ok: Boolean(body?.ok),
    runtime: body?.runtime ?? 'unknown',
    buildId: body?.buildId ?? '',
    timestamp: body?.timestamp ?? new Date().toISOString(),
    kv: {
      imagesBound: Boolean(kv?.imagesBound),
      statsBound: Boolean(kv?.statsBound),
    },
  };
}

/**
 * 自助测速：请求 /api/random，测「发起到收到响应头」的毫秒数。
 *
 * redirect 必须 manual —— API 默认 302 到第三方图床，cors 模式跟随重定向会
 * 撞上图床无 CORS 头 + 本站 CSP connect-src 'self' 拦外域，浏览器直接
 * `Failed to fetch`（线上状态页实测踩过）。manual 模式在自家首响应处止步：
 * 302 本身即「服务正常返回」，opaque 重定向响应也照常 resolve。
 * 真正测的就是用户接入的第一跳；图床快慢不由本 API 背书。
 */
export async function measureRandomLatency(): Promise<number> {
  const start = performance.now();
  // 走 buildApiPath：预览链接（?eo_token=…）上裸 fetch 会打到生产部署，
  // 测出来的延迟与预览环境无关 —— 与 apiRequest 补预览参数同一契约。
  const response = await fetch(buildApiPath('/api/random'), {
    method: 'GET',
    redirect: 'manual',
    cache: 'no-store',
  });
  // opaqueredirect 的 status 是 0，但它代表 3xx 已返回；2xx/3xx 都算可达
  const reachable =
    response.type === 'opaqueredirect' || (response.status >= 200 && response.status < 400);
  if (!reachable) {
    throw new Error(`接口返回异常状态 ${response.status}`);
  }
  return Math.round(performance.now() - start);
}

export async function fetchStats(): Promise<Stats> {
  // 不带 `_t`、不发 no-store：让边缘的 s-maxage=10 生效，
  // 全站 15s 一次的轮询就不用每次都回源打 KV
  return apiRequest<Stats>('/api/stats', undefined, '获取统计数据失败', { bustCache: false });
}

/**
 * ['stats'] 查询配置的单点定义：全站 5 个消费者（Hero/OnlinePreview/RealtimeStats/
 * gallery-browse/admin）共用同一 key 与节流参数，改轮询间隔只需动这里。
 */
const STATS_POLL_MS = 15_000;

export function statsQueryOptions() {
  return {
    queryKey: ['stats'] as const,
    queryFn: fetchStats,
    refetchInterval: STATS_POLL_MS,
    staleTime: STATS_POLL_MS,
  };
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
  const body = await apiRequest<PaginatedImages | ImageRecord[]>(
    `/api/list?${query.toString()}`,
    undefined,
    '获取图片列表失败',
    { bustCache: false },
  );

  // 归一化响应形状。契约上分页请求返回 { items, ... }，但 /api/list 还有
  // 「无参数时返回旧版裸数组」这条历史分支（同文件的 fetchExistingImageUrlSet
  // 就同时兼容两种形状）。图库页却直接 .flatMap(page => page.items)：
  // 一旦拿到不是 { items: [...] } 的东西（裸数组、items 缺失或非数组），
  // flatMap 会产出 undefined 项 —— 它不抛错，而是产出 [undefined]：
  // images.length 不为 0，isEmpty 判不出来，于是照常渲染网格，
  // MasonryTile 读 image.url 时崩，整页落到错误边界而不是干净的空态。
  // 在边界处收口，调用方不必各写一套防御。
  if (Array.isArray(body)) {
    return {
      items: body,
      page: params.page,
      pageSize: params.pageSize,
      total: body.length,
      totalPages: 1,
      hasPrevPage: false,
      hasNextPage: false,
    };
  }

  const items = Array.isArray(body?.items) ? body.items : [];
  return {
    items,
    page: typeof body?.page === 'number' ? body.page : params.page,
    pageSize: typeof body?.pageSize === 'number' ? body.pageSize : params.pageSize,
    total: typeof body?.total === 'number' ? body.total : items.length,
    totalPages: typeof body?.totalPages === 'number' ? body.totalPages : 1,
    hasPrevPage: Boolean(body?.hasPrevPage),
    hasNextPage: Boolean(body?.hasNextPage),
  };
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

/**
 * 批量接口的结果归一化。
 *
 * 调用方（add-image-dialog / batch-update-tags-dialog）直接读
 *   result.success / result.failed / result.results.filter(...)
 * 而原来的 Promise<{...}> 只是**类型注解**，运行时并不校验：
 * apiRequest 返回什么就是什么。一旦响应体缺 results（或它不是数组），
 * .filter 会抛 'Cannot read properties of undefined (reading filter)'，
 * 被 catch 之后经 getErrorMessage 原样弹给管理员 —— 一句与真实情况
 * 无关的英文 TypeError，而不是「服务端返回异常，请重试」。
 *
 * 这里在边界收口：形状不对就抛一条人能看懂的错误。
 */
function normalizeBatchResult<T extends { success: boolean }>(
  body: unknown,
  fallbackMessage: string,
): { total: number; success: number; failed: number; results: T[] } {
  const raw = (body ?? {}) as {
    total?: unknown;
    success?: unknown;
    failed?: unknown;
    results?: unknown;
  };
  // 真正无法使用的情形：results 不是数组。这时调用方的 .filter 必炸，
  // 与其让它抛一句英文 TypeError，不如在这里给出明确的失败信息。
  if (!Array.isArray(raw.results)) {
    throw new Error(`${fallbackMessage}：服务端返回的结果格式异常`);
  }
  const results = raw.results as T[];
  const num = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const success = num(raw.success, results.filter((item) => item?.success).length);
  return {
    total: num(raw.total, results.length),
    success,
    failed: num(raw.failed, Math.max(0, results.length - success)),
    results,
  };
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
  const body = await apiRequest<unknown>(
    '/api/batch',
    { method: 'POST', headers: getAdminHeaders(adminToken), body: JSON.stringify({ images }) },
    '批量添加图片失败',
  );
  return normalizeBatchResult(body, '批量添加图片失败');
}

/**
 * 批量增删标签：单事务（后端 withGalleryTransaction），比逐张 PUT 少 N-1 次
 * 全库读改写；重复 id 幂等、removeTags 大小写不敏感（与全站检索契约一致）。
 */
export async function batchUpdateImageTags(
  data: { ids: string[]; addTags?: string[]; removeTags?: string[] },
  adminToken: string,
): Promise<{
  total: number;
  success: number;
  failed: number;
  results: Array<{ success: boolean; id: string; tags?: string[]; error?: string }>;
}> {
  const body = await apiRequest<unknown>(
    '/api/batch-update',
    { method: 'POST', headers: getAdminHeaders(adminToken), body: JSON.stringify(data) },
    '批量修改标签失败',
  );
  return normalizeBatchResult(body, '批量修改标签失败');
}
