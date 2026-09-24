// ============================================================
// Business API Functions
// ============================================================

import type { HealthPayload, ImageRecord, Stats, PaginatedImages } from './types';
import { apiRequest } from './api-client';
import { buildApiPath } from './url';
import { canonicalizeImageUrl } from './helpers';


/**
   * 把「声称是时间戳的字符串」收成一个必定可渲染的值。
   *
   * 后端字段在契约上是 ISO 串，但前端只做了 `typeof === 'string'` 的检查：
   * 一旦拿到解析不了的串（脏数据、上游透传、字段改名），`new Date(x)` 会得到
   * Invalid Date，而 `toLocaleDateString()` / `toLocaleTimeString()` 会把它
   * **原样渲染成字面量 "Invalid Date"** —— 中文页面上直接露出英文脏值。
   * 这里在边界处校验可解析性，解析不了就回退（调用方各自给合理默认）。
   */
function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

/**
 * 把「声称是字符串」的字段收成真的字符串。
 *
 * `body?.runtime ?? unknown` 只挡 null/undefined：若服务端给了对象/数组，
 * React 渲染它时会抛 "Objects are not valid as a React child"，整页落到
 * 错误边界。实测把 /api/health 的 runtime 换成 {name:"edge"}，状态页直接
 * 显示「页面出错了」—— 而这正是「服务挂了时用户来看」的页面，它自己崩掉
 * 是最糟的结果。
 */
function toStringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * 列表项的运行时形状守卫。
 *
 * fetchImagesPage 原先只校验 `items` 是数组，**不校验数组里的每个元素**：
 * 一条 null 就会一路进到 MasonryTile，读 image.url 时抛错、整页落到错误边界。
 * 实测（items 里塞一条 null）：/gallery 与 / 都变成「页面出错了」。
 * 这里把不满足最低形状的项滤掉 —— 少一张图远好过整页白给。
 * 连 tags 的**元素**也要查：`tags: [{bad:1}]` 能通过 Array.isArray，
 * 但 MasonryTile 渲染 image.tags[0]、灯箱 map 标签时，React 会因
 * object 子元素抛错 —— 实测同样让 /gallery 与 / 整页崩到错误边界。
 */
function isImageRecord(value: unknown): value is ImageRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.url === 'string' &&
    typeof item.title === 'string' &&
    Array.isArray(item.tags) && item.tags.every((tag) => typeof tag === 'string')
  );
}
// ---- Public API ----

export async function fetchRandomImage(tag?: string, exclude?: string): Promise<ImageRecord> {
  const params = new URLSearchParams();
  if (tag) params.set('tag', tag);
  // 「换一张」时带上上一张的 id，后端在同标签还有别的图时保证不撞回它
  if (exclude) params.set('exclude', exclude);
  params.set('format', 'json');
  const query = params.toString();

  const body = await apiRequest<unknown>(
    `/api/random${query ? `?${query}` : ''}`,
    undefined,
    '获取随机图片失败',
  );

  // 随机图也要过形状守卫：OnlinePreview 直接读 img.tags 并 .map 渲染，
  // 脏 tags（如 [{bad:1}]）会让首页整页崩到错误边界（实测确认）。
  if (!isImageRecord(body)) {
    throw new Error('接口返回的图片数据格式异常');
  }
  return body;
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
    runtime: toStringOr(body?.runtime, 'unknown'),
    buildId: toStringOr(body?.buildId, ''),
    timestamp: toIsoOrNull(body?.timestamp) ?? new Date().toISOString(),
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
  const body = await apiRequest<Partial<Stats>>(
    '/api/stats',
    undefined,
    '获取统计数据失败',
    { bustCache: false },
  );

  // 归一化：/api/stats 有 5 个消费者（Hero / OnlinePreview / RealtimeStats /
  // gallery-browse / admin），都直接读 tags 与几个计数字段。
  // 其中 stats?.tags?.map(...) 只挡得住 null/undefined，挡不住类型不对：
  // tags 若是字符串，?.map 会抛 'stats?.tags?.map is not a function'；
  // stats?.tags ?? [] 同样会把字符串原样放行（长度是字符数，map 时才炸）。
  // 后端目前有 sanitizeImagesMeta 兜底，但前端与这个接口的契约一直没校验；
  // 在边界收口，5 个消费者就不必各自防御。
  const tags = Array.isArray(body?.tags) ? body.tags : [];
  // dailyRequests 的 value 也必须逐个校验数字。只用 `?? {}` 挡 null/undefined，
  // 挡不住「值是字符串」：RealtimeStats 的 `sum + item.requests` 会退化成字符串拼接，
  // 实测把某天写成 "12" 后，「近 7 天」显示成 1,201,307,685,123 次（正确值 300）。
  const rawDaily = body?.dailyRequests;
  const daily: Record<string, number> = {};
  if (rawDaily && typeof rawDaily === 'object' && !Array.isArray(rawDaily)) {
    for (const [key, value] of Object.entries(rawDaily as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) daily[key] = value;
    }
  }
  const num = (value: unknown, fallback = 0) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return {
    totalRequests: num(body?.totalRequests),
    todayRequests: num(body?.todayRequests),
    totalImages: num(body?.totalImages),
    totalSites: num(body?.totalSites),
    lastRequestAt: toIsoOrNull(body?.lastRequestAt),
    tags,
    dailyRequests: daily,
  };
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
      items: body.filter(isImageRecord),
      page: params.page,
      pageSize: params.pageSize,
      total: body.length,
      totalPages: 1,
      hasPrevPage: false,
      hasNextPage: false,
    };
  }

  const items = Array.isArray(body?.items) ? body.items.filter(isImageRecord) : [];
  // 数字字段原先只查 `typeof === 'number'` —— 但 NaN、0、负数、小数全是 'number'。
  // 脏值一路进 UI：totalPages=0 让后台「第 N / 0 页」自相矛盾、<Input max> 非法；
  // 小数让 getVisiblePages 的 Array.from({length}) 与真实页数错位；
  // page=NaN 让 `data.page !== page` 恒真、后台无限 setPage；total=NaN 直接显示「NaN 张」。
  // 与同文件其它字段（toIsoOrNull / toStringOr / num）同一口径：在边界收口。
  const num = (value: unknown, fallback: number, min = 0) =>
    typeof value === 'number' && Number.isFinite(value) && value >= min ? value : fallback;
  // 页码/页大小必须是正整数：小数与 0 都会破坏分页算术
  const int = (value: unknown, fallback: number) => {
    const n = num(value, fallback, 1);
    return Number.isInteger(n) ? n : fallback;
  };
  const total = num(body?.total, items.length);
  // totalPages 至少 1：UI 用「1」兜底页码，0 页在展示层无意义
  const totalPages = Math.max(1, int(body?.totalPages, 1));
  return {
    items,
    page: Math.min(int(body?.page, params.page), totalPages),
    pageSize: int(body?.pageSize, params.pageSize),
    total: Math.max(total, items.length),
    totalPages,
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
  // 响应体本身也要守：返回 JSON `null` 时 `body.items` 会抛「Cannot read properties of null」，
  // 同样让批量导入预检整体失败。非数组、非对象、items 非数组一律当空集合
  //（没有可去重的历史地址，不该阻断导入）。
  const records = Array.isArray(body)
    ? body
    : body && typeof body === 'object' && Array.isArray(body.items)
      ? body.items
      : [];
  const set = new Set<string>();
  // 原先直接读 record.url —— 一条 null 就抛 TypeError，
  // 让「批量导入」的去重预检整个失败（界面提示「库内地址读取失败，导入会被拦下」），
  // 管理员从此导不进任何图片，只因为库里有一条脏数据。
  for (const record of records) {
    const canonical = isImageRecord(record) ? canonicalizeImageUrl(record.url) : null;
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
  // 只挡容器类型还不够：调用方逐项读 item.success / item.url / item.error，
  // 一条 null（或字符串）元素就会抛 'Cannot read properties of null (reading success)'
  // —— 英文 TypeError 经 getErrorMessage 原样弹给管理员。与 P123 的 tags 元素
  // 校验同一类口子：容器与元素都要守。success 是调用方按布尔消费的字段，必查。
  const isBatchItem = (value: unknown): value is T =>
    Boolean(value) && typeof value === 'object' && typeof (value as { success?: unknown }).success === 'boolean';
  if (!raw.results.every(isBatchItem)) {
    throw new Error(`${fallbackMessage}：服务端返回的结果格式异常`);
  }
  const results = raw.results;
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
