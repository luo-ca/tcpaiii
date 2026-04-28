// EdgeKV 全局类型声明（阿里云 ESA Edge Runtime 内置对象）
declare class EdgeKV {
  constructor(options: { namespace: string });
  get(key: string): Promise<string | undefined>;
  get(key: string, options: { type: 'json' }): Promise<object | undefined>;
  get(key: string, options: { type: 'arrayBuffer' }): Promise<ArrayBuffer | undefined>;
  get(key: string, options: { type: 'stream' }): Promise<ReadableStream | undefined>;
  put(key: string, value: string | ArrayBuffer | ReadableStream): Promise<void>;
  delete(key: string): Promise<boolean>;
}

type ImageRecord = {
  id: string;
  url: string;
  title: string;
  tags: string[];
  createdAt: string;
};

type Stats = {
  totalRequests: number;
  lastRequestAt: string | null;
  dailyRequests: Record<string, number>;
};

type AdminConfig = {
  tokenSha256: string | null;
  updatedAt: string | null;
};

type JsonObject = Record<string, unknown>;
type RuntimeGlobals = typeof globalThis & {
  ADMIN_TOKEN?: string;
  ADMIN_TOKEN_SHA256?: string;
  __ENV?: Record<string, string | undefined>;
  process?: {
    env?: Record<string, string | undefined>;
  };
};
type RuntimeEnv = Record<string, string | undefined> | {
  env?: Record<string, string | undefined>;
  bindings?: Record<string, string | undefined>;
};

const MAX_BATCH_SIZE = 500;
const DEFAULT_LIST_PAGE_SIZE = 24;
const MAX_LIST_PAGE_SIZE = 60;
const ALLOWED_IMAGE_PROTOCOLS = new Set(['http:', 'https:']);
const STATS_TIME_ZONE = 'Asia/Shanghai';
const ADMIN_CONFIG_KEY = 'admin-config';

// ============================================================
// KV Helpers (懒加载 EdgeKV，避免模块顶层初始化导致崩溃)
// ============================================================

let _kvImages: EdgeKV | null = null;
let _kvStats: EdgeKV | null = null;

function getKvImages(): EdgeKV {
  if (!_kvImages) {
    _kvImages = new EdgeKV({ namespace: 'images' });
  }
  return _kvImages;
}

function getKvStats(): EdgeKV {
  if (!_kvStats) {
    _kvStats = new EdgeKV({ namespace: 'stats' });
  }
  return _kvStats;
}

function parseStoredJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') {
    return value === undefined ? fallback : (value as T);
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function getRuntimeSecret(name: 'ADMIN_TOKEN' | 'ADMIN_TOKEN_SHA256', runtimeEnv?: RuntimeEnv): string | undefined {
  const runtime = globalThis as RuntimeGlobals;
  return getEnvSecret(runtimeEnv, name)
    || runtime[name]
    || runtime.__ENV?.[name]
    || runtime.process?.env?.[name];
}

function getEnvSecret(runtimeEnv: RuntimeEnv | undefined, name: 'ADMIN_TOKEN' | 'ADMIN_TOKEN_SHA256'): string | undefined {
  if (!runtimeEnv || typeof runtimeEnv !== 'object') return undefined;
  const directValue = (runtimeEnv as Record<string, string | undefined>)[name];
  if (directValue) return directValue;

  const envValue = 'env' in runtimeEnv ? runtimeEnv.env?.[name] : undefined;
  if (envValue) return envValue;

  return 'bindings' in runtimeEnv ? runtimeEnv.bindings?.[name] : undefined;
}

async function getAllImages(): Promise<ImageRecord[]> {
  const data = await getKvImages().get('all');
  if (!data) return [];

  const parsed = parseStoredJson<unknown>(data, []);
  return Array.isArray(parsed) ? parsed : [];
}

async function saveAllImages(images: ImageRecord[]): Promise<void> {
  await getKvImages().put('all', JSON.stringify(images));
}

async function getStats(): Promise<Stats> {
  const data = await getKvStats().get('data');
  if (!data) return { totalRequests: 0, lastRequestAt: null, dailyRequests: {} };

  const parsed = parseStoredJson<JsonObject>(data, {});
  const dailyRequests = isJsonObject(parsed.dailyRequests)
    ? Object.fromEntries(
        Object.entries(parsed.dailyRequests)
          .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
      )
    : {};

  return {
    totalRequests: typeof parsed.totalRequests === 'number' ? parsed.totalRequests : 0,
    lastRequestAt: typeof parsed.lastRequestAt === 'string' ? parsed.lastRequestAt : null,
    dailyRequests,
  };
}

async function saveStats(stats: Stats): Promise<void> {
  await getKvStats().put('data', JSON.stringify(stats));
}

async function getAdminConfig(): Promise<AdminConfig> {
  const data = await getKvStats().get(ADMIN_CONFIG_KEY);
  if (!data) return { tokenSha256: null, updatedAt: null };

  const parsed = parseStoredJson<JsonObject>(data, {});
  const tokenSha256 = typeof parsed.tokenSha256 === 'string' && isSha256Hex(parsed.tokenSha256)
    ? parsed.tokenSha256.toLowerCase()
    : null;

  return {
    tokenSha256,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
  };
}

async function saveAdminConfig(config: AdminConfig): Promise<void> {
  await getKvStats().put(ADMIN_CONFIG_KEY, JSON.stringify(config));
}

function getStatsDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: STATS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function getRecentStatsDateKeys(days = 7, date = new Date()): string[] {
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(date);
    day.setUTCDate(day.getUTCDate() - (days - index - 1));
    return getStatsDateKey(day);
  });
}

// ============================================================
// Validation helpers
// ============================================================

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJsonObject(request: Request): Promise<JsonObject | null> {
  try {
    const body = await request.json();
    return isJsonObject(body) ? body : null;
  } catch {
    return null;
  }
}

function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

function normalizeImageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    return ALLOWED_IMAGE_PROTOCOLS.has(parsed.protocol) ? trimmed : null;
  } catch {
    return null;
  }
}

function normalizeTitle(value: unknown, fallback = '未命名图片'): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeTags(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  if (value.some(tag => typeof tag !== 'string')) return null;

  const tags = value
    .map(tag => tag.trim())
    .filter(Boolean);

  return [...new Set(tags)];
}

function normalizePositiveInt(value: string | null, fallback: number, max?: number): number {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;

  return max ? Math.min(parsed, max) : parsed;
}

function getBearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!header) return null;

  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function timingSafeEqualString(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyAdminRequest(request: Request, runtimeEnv?: RuntimeEnv): Promise<Response | null> {
  const token = getBearerToken(request);
  if (!token) {
    return json({ error: 'Admin token required' }, 401);
  }

  const plainToken = getRuntimeSecret('ADMIN_TOKEN', runtimeEnv);
  if (plainToken) {
    return timingSafeEqualString(token, plainToken) ? null : json({ error: 'Invalid admin token' }, 403);
  }

  const tokenHash = getRuntimeSecret('ADMIN_TOKEN_SHA256', runtimeEnv)?.toLowerCase();
  if (tokenHash) {
    const candidateHash = await sha256Hex(token);
    return timingSafeEqualString(candidateHash, tokenHash) ? null : json({ error: 'Invalid admin token' }, 403);
  }

  const adminConfig = await getAdminConfig();
  if (adminConfig.tokenSha256) {
    const candidateHash = await sha256Hex(token);
    return timingSafeEqualString(candidateHash, adminConfig.tokenSha256) ? null : json({ error: 'Invalid admin token' }, 403);
  }

  return json({ error: 'Admin token is not configured' }, 503);
}

async function handleAdminVerify(request: Request, runtimeEnv?: RuntimeEnv): Promise<Response> {
  const authError = await verifyAdminRequest(request, runtimeEnv);
  if (authError) return authError;

  return json({ ok: true });
}

async function handleAdminBootstrap(request: Request, runtimeEnv?: RuntimeEnv): Promise<Response> {
  const existingPlainToken = getRuntimeSecret('ADMIN_TOKEN', runtimeEnv);
  const existingTokenHash = getRuntimeSecret('ADMIN_TOKEN_SHA256', runtimeEnv)?.toLowerCase();
  if (existingPlainToken || existingTokenHash) {
    return json({ error: 'Admin token is already configured by runtime env' }, 409);
  }

  const currentConfig = await getAdminConfig();
  if (currentConfig.tokenSha256) {
    return json({ error: 'Admin token is already configured in KV' }, 409);
  }

  const body = await readJsonObject(request);
  if (!body || typeof body.token !== 'string' || !body.token.trim()) {
    return json({ error: 'token is required' }, 400);
  }

  await saveAdminConfig({
    tokenSha256: await sha256Hex(body.token.trim()),
    updatedAt: new Date().toISOString(),
  });

  return json({ ok: true }, 201);
}

// ============================================================
// CORS helper
// ============================================================

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '0',
  };
}

function noStoreHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
    'CDN-Cache-Control': 'no-store',
    'Surrogate-Control': 'no-store',
    Pragma: 'no-cache',
    Expires: '0',
    Vary: 'Accept, Accept-Encoding',
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...noStoreHeaders(),
      ...corsHeaders(),
    },
  });
}

// ============================================================
// Route handlers
// ============================================================

// GET /api/random — 随机返回一张图片（核心 API）
async function handleRandomImage(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const tag = url.searchParams.get('tag') || url.searchParams.get('type');
  const format = url.searchParams.get('format');
  const wantsJson = url.searchParams.has('json')
    || format === 'json'
    || url.searchParams.get('redirect') === 'false';

  const images = await getAllImages();
  if (images.length === 0) {
    return json({ error: 'No images available' }, 404);
  }

  let candidates = images;
  if (tag) {
    candidates = images.filter(img =>
      img.tags.some(t => t.toLowerCase() === tag.toLowerCase())
    );
  }

  if (candidates.length === 0) {
    return json({ error: `No images found with tag: ${tag}` }, 404);
  }

  const randomIndex = Math.floor(Math.random() * candidates.length);
  const selected = candidates[randomIndex];

  // 异步更新统计（不阻塞响应）
  try {
    const stats = await getStats();
    const now = new Date();
    const today = getStatsDateKey(now);
    stats.totalRequests++;
    stats.lastRequestAt = now.toISOString();
    stats.dailyRequests[today] = (stats.dailyRequests[today] ?? 0) + 1;
    await saveStats(stats);
  } catch {
    // 统计失败不影响主流程
  }

  if (wantsJson) {
    return json({
      id: selected.id,
      url: selected.url,
      title: selected.title,
      tags: selected.tags,
      createdAt: selected.createdAt,
    });
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: selected.url,
      ...noStoreHeaders(),
      ...corsHeaders(),
    },
  });
}

// GET /api/list — 获取图片列表，支持分页参数
async function handleListImages(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const images = await getAllImages();
  const pageParam = url.searchParams.get('page');
  const pageSizeParam = url.searchParams.get('pageSize');
  const search = url.searchParams.get('search')?.trim().toLowerCase() ?? '';
  const tag = url.searchParams.get('tag')?.trim() ?? '';

  if (!pageParam && !pageSizeParam && !search && !tag) {
    return json(images);
  }

  let filtered = images;

  if (tag) {
    filtered = filtered.filter(img =>
      img.tags.some(item => item.toLowerCase() === tag.toLowerCase())
    );
  }

  if (search) {
    filtered = filtered.filter(img =>
      img.title.toLowerCase().includes(search)
      || img.url.toLowerCase().includes(search)
      || img.tags.some(item => item.toLowerCase().includes(search))
    );
  }

  const page = normalizePositiveInt(pageParam, 1);
  const pageSize = normalizePositiveInt(pageSizeParam, DEFAULT_LIST_PAGE_SIZE, MAX_LIST_PAGE_SIZE);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return json({
    items,
    page,
    pageSize,
    total,
    totalPages,
    hasPrevPage: page > 1,
    hasNextPage: page < totalPages,
  });
}

// POST /api/batch — 批量添加图片
async function handleBatchCreateImages(request: Request): Promise<Response> {
  const body = await readJsonObject(request);

  if (!body) {
    return json({ error: 'Request body must be a valid JSON object' }, 400);
  }

  if (!Array.isArray(body.images) || body.images.length === 0) {
    return json({ error: 'images array is required and must not be empty' }, 400);
  }

  if (body.images.length > MAX_BATCH_SIZE) {
    return json({ error: `Maximum ${MAX_BATCH_SIZE} images per batch request` }, 400);
  }

  const images = await getAllImages();
  const existingUrls = new Set(images.map(img => img.url));
  const results: Array<{ success: boolean; url: string; id?: string; error?: string }> = [];

  for (const item of body.images) {
    if (!isJsonObject(item)) {
      results.push({ success: false, url: '', error: 'Invalid image payload' });
      continue;
    }

    const trimmedUrl = normalizeImageUrl(item.url);

    if (!trimmedUrl) {
      results.push({ success: false, url: typeof item.url === 'string' ? item.url.trim() : '', error: 'URL must be a valid http(s) URL' });
      continue;
    }

    if (existingUrls.has(trimmedUrl)) {
      results.push({ success: false, url: trimmedUrl, error: 'URL already exists' });
      continue;
    }

    const tags = normalizeTags(item.tags);
    if (!tags) {
      results.push({ success: false, url: trimmedUrl, error: 'Tags must be an array of strings' });
      continue;
    }

    const newImage: ImageRecord = {
      id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: trimmedUrl,
      title: normalizeTitle(item.title),
      tags,
      createdAt: new Date().toISOString(),
    };

    images.push(newImage);
    existingUrls.add(trimmedUrl);
    results.push({ success: true, url: trimmedUrl, id: newImage.id });
  }

  await saveAllImages(images);

  const successCount = results.filter(r => r.success).length;
  return json({
    total: body.images.length,
    success: successCount,
    failed: body.images.length - successCount,
    results,
  }, 201);
}

// POST /api/create — 添加新图片
async function handleCreateImage(request: Request): Promise<Response> {
  const body = await readJsonObject(request);

  if (!body) {
    return json({ error: 'Request body must be a valid JSON object' }, 400);
  }

  const imageUrl = normalizeImageUrl(body.url);
  if (!imageUrl) {
    return json({ error: 'url must be a valid http(s) URL' }, 400);
  }

  const tags = normalizeTags(body.tags);
  if (!tags) {
    return json({ error: 'tags must be an array of strings' }, 400);
  }

  const images = await getAllImages();

  const newImage: ImageRecord = {
    id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url: imageUrl,
    title: normalizeTitle(body.title),
    tags,
    createdAt: new Date().toISOString(),
  };

  if (images.some(img => img.url === newImage.url)) {
    return json({ error: 'Image URL already exists' }, 409);
  }

  images.push(newImage);
  await saveAllImages(images);

  return json(newImage, 201);
}

// PUT /api/update/:id — 更新图片信息
async function handleUpdateImage(request: Request, id: string): Promise<Response> {
  const body = await readJsonObject(request);

  if (!body) {
    return json({ error: 'Request body must be a valid JSON object' }, 400);
  }

  const images = await getAllImages();
  const index = images.findIndex(img => img.id === id);

  if (index === -1) {
    return json({ error: 'Image not found' }, 404);
  }

  const nextUrl = body.url === undefined ? images[index].url : normalizeImageUrl(body.url);
  if (!nextUrl) {
    return json({ error: 'url must be a valid http(s) URL' }, 400);
  }

  if (nextUrl !== images[index].url) {
    if (images.some(img => img.id !== id && img.url === nextUrl)) {
      return json({ error: 'Image URL already exists' }, 409);
    }
  }

  const nextTags = body.tags === undefined ? images[index].tags : normalizeTags(body.tags);
  if (!nextTags) {
    return json({ error: 'tags must be an array of strings' }, 400);
  }

  images[index] = {
    ...images[index],
    url: nextUrl,
    title: body.title === undefined ? images[index].title : normalizeTitle(body.title, images[index].title),
    tags: nextTags,
  };

  await saveAllImages(images);
  return json(images[index]);
}

// DELETE /api/delete/:id — 删除图片
async function handleDeleteImage(id: string): Promise<Response> {
  const images = await getAllImages();
  const filtered = images.filter(img => img.id !== id);

  if (filtered.length === images.length) {
    return json({ error: 'Image not found' }, 404);
  }

  await saveAllImages(filtered);
  return json({ success: true, deletedId: id });
}

// GET /api/stats — 获取统计信息
async function handleStats(): Promise<Response> {
  const stats = await getStats();
  const images = await getAllImages();
  const today = getStatsDateKey();
  const recentDateKeys = getRecentStatsDateKeys();

  return json({
    totalRequests: stats.totalRequests,
    todayRequests: stats.dailyRequests[today] ?? 0,
    lastRequestAt: stats.lastRequestAt,
    totalImages: images.length,
    dailyRequests: Object.fromEntries(
      recentDateKeys.map(dateKey => [dateKey, stats.dailyRequests[dateKey] ?? 0])
    ),
    tags: [...new Set(images.flatMap(img => img.tags))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
  });
}

// ============================================================
// Main fetch handler
// ============================================================

const handler = {
  async fetch(request: Request, runtimeEnv?: RuntimeEnv): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          ...noStoreHeaders(),
          ...corsHeaders(),
        },
      });
    }

    try {
      // --- 路由匹配 ---

      // GET /api/random
      if (pathname === '/api/random') {
        if (request.method === 'GET') return handleRandomImage(request);
        return json({ error: 'Method Not Allowed' }, 405);
      }

      // GET /api/list
      if (pathname === '/api/list') {
        if (request.method === 'GET') return handleListImages(request);
        return json({ error: 'Method Not Allowed' }, 405);
      }

      // GET /api/admin/verify
      if (pathname === '/api/admin/verify') {
        if (request.method === 'GET') return handleAdminVerify(request, runtimeEnv);
        return json({ error: 'Method Not Allowed' }, 405);
      }

      // POST /api/admin/bootstrap
      if (pathname === '/api/admin/bootstrap') {
        if (request.method === 'POST') return handleAdminBootstrap(request, runtimeEnv);
        return json({ error: 'Method Not Allowed' }, 405);
      }

      // POST /api/batch
      if (pathname === '/api/batch') {
        if (request.method === 'POST') {
          const authError = await verifyAdminRequest(request, runtimeEnv);
          if (authError) return authError;
          return handleBatchCreateImages(request);
        }
        return json({ error: 'Method Not Allowed' }, 405);
      }

      // POST /api/create
      if (pathname === '/api/create') {
        if (request.method === 'POST') {
          const authError = await verifyAdminRequest(request, runtimeEnv);
          if (authError) return authError;
          return handleCreateImage(request);
        }
        return json({ error: 'Method Not Allowed' }, 405);
      }

      // PUT /api/update/:id
      const updateMatch = pathname.match(/^\/api\/update\/(.+)$/);
      if (updateMatch) {
        if (request.method === 'PUT') {
          const authError = await verifyAdminRequest(request, runtimeEnv);
          if (authError) return authError;
          return handleUpdateImage(request, updateMatch[1]);
        }
        return json({ error: 'Method Not Allowed' }, 405);
      }

      // DELETE /api/delete/:id
      const deleteMatch = pathname.match(/^\/api\/delete\/(.+)$/);
      if (deleteMatch) {
        if (request.method === 'DELETE') {
          const authError = await verifyAdminRequest(request, runtimeEnv);
          if (authError) return authError;
          return handleDeleteImage(deleteMatch[1]);
        }
        return json({ error: 'Method Not Allowed' }, 405);
      }

      // GET /api/stats
      if (pathname === '/api/stats') {
        if (request.method === 'GET') return handleStats();
        return json({ error: 'Method Not Allowed' }, 405);
      }

      // 404
      return json({ error: 'Not Found' }, 404);
    } catch (err) {
      // 捕获所有未预期的运行时错误，防止 ER 进程崩溃
      console.error('Unhandled error:', err);
      return json({ error: 'Internal Server Error' }, 500);
    }
  },
};

export default handler;

export { handler };
export { getRecentStatsDateKeys, getStatsDateKey };
