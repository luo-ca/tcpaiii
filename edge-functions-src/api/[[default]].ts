// Source of truth for EdgeOne Pages Functions. Run `npm run build:functions`
// to generate edge-functions/api/[[default]].js for deployment.

type KvValue = string | ArrayBuffer | ArrayBufferView | ReadableStream;

type KvNamespace = {
    get(key: string): Promise<unknown>;
    put(key: string, value: KvValue): Promise<unknown>;
    delete?: (key: string) => Promise<unknown>;
    list?: (...args: unknown[]) => Promise<unknown>;
};

type EdgeKvConstructor = new (options: { namespace: string }) => KvNamespace;
type RuntimeBinding = string | KvNamespace | undefined;
type RuntimeBindingRecord = Record<string, RuntimeBinding> & {
    env?: RuntimeBindingRecord;
    bindings?: RuntimeBindingRecord;
};
type RuntimeEnv = RuntimeBindingRecord | undefined;
type RuntimeGlobals = typeof globalThis & {
    ADMIN_TOKEN?: string;
    ADMIN_TOKEN_SHA256?: string;
    EdgeKV?: EdgeKvConstructor;
    __ENV?: Record<string, string | undefined>;
    process?: {
        env?: Record<string, string | undefined>;
    };
};
type EdgeOnePagesContext = {
    request: Request;
    env?: RuntimeEnv;
};
type ImageRecord = {
    id: string;
    url: string;
    title: string;
    tags: string[];
    createdAt: string;
};
type StatsRecord = {
    totalRequests: number;
    lastRequestAt: string | null;
    dailyRequests: Record<string, number>;
};

declare const images_kv: KvNamespace | undefined;
declare const IMAGES_KV: KvNamespace | undefined;
declare const images: KvNamespace | undefined;
declare const stats_kv: KvNamespace | undefined;
declare const STATS_KV: KvNamespace | undefined;
declare const stats: KvNamespace | undefined;

const MAX_BATCH_SIZE = 500;
const DEFAULT_LIST_PAGE_SIZE = 24;
const MAX_LIST_PAGE_SIZE = 60;
const MAX_TITLE_LENGTH = 120;
const MAX_TAG_LENGTH = 40;
const MAX_TAGS_PER_IMAGE = 20;
const ALLOWED_IMAGE_PROTOCOLS = new Set(['http:', 'https:']);
const STATS_TIME_ZONE = 'Asia/Shanghai';
const ADMIN_CONFIG_KEY = 'admin_config';
const API_BUILD_ID = 'edgeone-js-kv-safe-2026-04-29';
const KV_BINDING_NAMES = {
    images: ['images_kv', 'IMAGES_KV', 'images'],
    stats: ['stats_kv', 'STATS_KV', 'stats'],
};
// ============================================================
// KV Helpers
// EdgeOne Pages KV is exposed through project-bound variables
// such as images_kv and stats_kv. The EdgeKV constructor remains
// as a local-test/legacy fallback.
// ============================================================
let _legacyKvImages: KvNamespace | null = null;
let _legacyKvStats: KvNamespace | null = null;
function getKvImages(runtimeEnv?: RuntimeEnv) {
    const directBinding = getDirectKvBinding(() => images_kv)
        || getDirectKvBinding(() => IMAGES_KV)
        || getDirectKvBinding(() => images);
    if (directBinding)
        return directBinding;
    return getRuntimeKv(runtimeEnv, KV_BINDING_NAMES.images, 'images', () => {
        if (!_legacyKvImages) {
            _legacyKvImages = createLegacyKv('images');
        }
        return _legacyKvImages;
    });
}
function getKvStats(runtimeEnv?: RuntimeEnv) {
    const directBinding = getDirectKvBinding(() => stats_kv)
        || getDirectKvBinding(() => STATS_KV)
        || getDirectKvBinding(() => stats);
    if (directBinding)
        return directBinding;
    return getRuntimeKv(runtimeEnv, KV_BINDING_NAMES.stats, 'stats', () => {
        if (!_legacyKvStats) {
            _legacyKvStats = createLegacyKv('stats');
        }
        return _legacyKvStats;
    });
}
function getDirectKvBinding(readBinding: () => unknown) {
    try {
        const binding = readBinding();
        return isKvNamespace(binding) ? binding : undefined;
    }
    catch {
        return undefined;
    }
}
function getRuntimeKv(runtimeEnv: RuntimeEnv, bindingNames: string[], namespace: string, fallback: () => KvNamespace) {
    for (const name of bindingNames) {
        const envBinding = getEnvBinding(runtimeEnv, name);
        if (isKvNamespace(envBinding))
            return envBinding;
        const globalBinding = globalThis[name];
        if (isKvNamespace(globalBinding))
            return globalBinding;
    }
    return fallback();
}
function createLegacyKv(namespace: string) {
    const EdgeKV = (globalThis as RuntimeGlobals).EdgeKV;
    if (!EdgeKV) {
        throw new Error(`EdgeOne KV binding is missing. Bind namespace "${namespace}" as "${namespace}_kv".`);
    }
    return new EdgeKV({ namespace });
}
function isKvNamespace(value: unknown): value is KvNamespace {
    return isJsonObject(value)
        && typeof value.get === 'function'
        && typeof value.put === 'function';
}
function hasRuntimeKvBinding(runtimeEnv: RuntimeEnv, bindingNames: string[]) {
    const runtime = globalThis as RuntimeGlobals & Record<string, unknown>;
    return bindingNames.some(name => isKvNamespace(getEnvBinding(runtimeEnv, name)) || isKvNamespace(runtime[name]));
}
function getKvHealth(runtimeEnv?: RuntimeEnv) {
    return {
        imagesBound: Boolean(getDirectKvBinding(() => images_kv)
            || getDirectKvBinding(() => IMAGES_KV)
            || getDirectKvBinding(() => images)
            || hasRuntimeKvBinding(runtimeEnv, KV_BINDING_NAMES.images)),
        statsBound: Boolean(getDirectKvBinding(() => stats_kv)
            || getDirectKvBinding(() => STATS_KV)
            || getDirectKvBinding(() => stats)
            || hasRuntimeKvBinding(runtimeEnv, KV_BINDING_NAMES.stats)),
    };
}
function parseStoredJson(value: unknown, fallback: unknown): unknown {
    if (typeof value !== 'string') {
        return value === undefined ? fallback : value;
    }
    try {
        return JSON.parse(value);
    }
    catch {
        return fallback;
    }
}
function sanitizeStoredImage(value: unknown): ImageRecord | null {
    if (!isJsonObject(value))
        return null;
    const imageUrl = normalizeImageUrl(value.url);
    if (!imageUrl)
        return null;
    const tags = normalizeTags(value.tags);
    const createdAt = typeof value.createdAt === 'string' && value.createdAt.trim()
        ? value.createdAt.trim()
        : new Date(0).toISOString();
    return {
        id: typeof value.id === 'string' && value.id.trim()
            ? value.id.trim()
            : `img-${createdAt}-${imageUrl}`,
        url: imageUrl,
        title: normalizeTitle(value.title),
        tags: tags || [],
        createdAt,
    };
}
function sanitizeStoredImages(value: unknown): ImageRecord[] {
    if (!Array.isArray(value))
        return [];
    return value.map(sanitizeStoredImage).filter((item): item is ImageRecord => Boolean(item));
}
function getRuntimeSecret(name: string, runtimeEnv?: RuntimeEnv) {
    const runtime = globalThis as RuntimeGlobals & Record<string, string | undefined>;
    return getEnvString(runtimeEnv, name)
        || runtime[name]
        || runtime.__ENV?.[name]
        || runtime.process?.env?.[name];
}
function getEnvString(runtimeEnv: RuntimeEnv, name: string) {
    const value = getEnvBinding(runtimeEnv, name);
    return typeof value === 'string' ? value : undefined;
}
function getEnvBinding(runtimeEnv: RuntimeEnv, name: string): RuntimeBinding {
    if (!runtimeEnv || typeof runtimeEnv !== 'object')
        return undefined;
    const directValue = runtimeEnv[name];
    if (directValue)
        return directValue;
    const envValue = 'env' in runtimeEnv ? runtimeEnv.env?.[name] : undefined;
    if (envValue)
        return envValue;
    return 'bindings' in runtimeEnv ? runtimeEnv.bindings?.[name] : undefined;
}
async function getAllImages(runtimeEnv?: RuntimeEnv): Promise<ImageRecord[]> {
    const data = await getKvImages(runtimeEnv).get('all');
    if (!data)
        return [];
    const parsed = parseStoredJson(data, []);
    return sanitizeStoredImages(parsed);
}
async function saveAllImages(images: ImageRecord[], runtimeEnv?: RuntimeEnv) {
    await getKvImages(runtimeEnv).put('all', JSON.stringify(images));
}
async function getStats(runtimeEnv?: RuntimeEnv): Promise<StatsRecord> {
    const data = await getKvStats(runtimeEnv).get('data');
    if (!data)
        return { totalRequests: 0, lastRequestAt: null, dailyRequests: {} };
    const parsed = parseStoredJson(data, {});
    const parsedStats = isJsonObject(parsed) ? parsed : {};
    const dailyRequests = {};
    if (isJsonObject(parsedStats.dailyRequests)) {
        for (const entry of Object.entries(parsedStats.dailyRequests)) {
            if (typeof entry[1] === 'number' && Number.isFinite(entry[1])) {
                dailyRequests[entry[0]] = entry[1];
            }
        }
    }
    return {
        totalRequests: typeof parsedStats.totalRequests === 'number' ? parsedStats.totalRequests : 0,
        lastRequestAt: typeof parsedStats.lastRequestAt === 'string' ? parsedStats.lastRequestAt : null,
        dailyRequests,
    };
}
async function saveStats(stats: StatsRecord, runtimeEnv?: RuntimeEnv) {
    await getKvStats(runtimeEnv).put('data', JSON.stringify(stats));
}
async function getAdminConfig(runtimeEnv?: RuntimeEnv) {
    const data = await getKvStats(runtimeEnv).get(ADMIN_CONFIG_KEY);
    if (!data)
        return { tokenSha256: null, updatedAt: null };
    const parsed = parseStoredJson(data, {});
    const parsedConfig = isJsonObject(parsed) ? parsed : {};
    const tokenSha256 = typeof parsedConfig.tokenSha256 === 'string' && isSha256Hex(parsedConfig.tokenSha256)
        ? parsedConfig.tokenSha256.toLowerCase()
        : null;
    return {
        tokenSha256,
        updatedAt: typeof parsedConfig.updatedAt === 'string' ? parsedConfig.updatedAt : null,
    };
}
function getStatsDateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat('zh-CN', {
        timeZone: STATS_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour12: false,
    }).format(date).match(/\d+/g);
    if (!parts || parts.length < 3) {
        return date.toISOString().slice(0, 10);
    }
    return `${parts[0]}-${parts[1]}-${parts[2]}`;
}
function getRecentStatsDateKeys(days = 7, date = new Date()) {
    return Array.from({ length: days }, (_, index) => {
        const day = new Date(date);
        day.setUTCDate(day.getUTCDate() - (days - index - 1));
        return getStatsDateKey(day);
    });
}
// ============================================================
// Validation helpers
// ============================================================
function isJsonObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
    try {
        const body = await request.json();
        return isJsonObject(body) ? body : null;
    }
    catch {
        return null;
    }
}
function isSha256Hex(value: string) {
    return /^[a-f0-9]{64}$/i.test(value);
}
function normalizeImageUrl(value: unknown): string | null {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    try {
        const parsed = new URL(trimmed);
        return ALLOWED_IMAGE_PROTOCOLS.has(parsed.protocol) ? trimmed : null;
    }
    catch {
        return null;
    }
}
function normalizeTitle(value: unknown, fallback = '未命名图片') {
    if (typeof value !== 'string')
        return fallback;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, MAX_TITLE_LENGTH) : fallback;
}
function normalizeTags(value: unknown): string[] | null {
    if (value === undefined)
        return [];
    if (!Array.isArray(value))
        return null;
    if (value.some(tag => typeof tag !== 'string'))
        return null;
    const tags = value
        .map(tag => tag.trim())
        .map(tag => tag.slice(0, MAX_TAG_LENGTH))
        .filter(Boolean);
    return [...new Set(tags)].slice(0, MAX_TAGS_PER_IMAGE);
}
function normalizePositiveInt(value: string | null, fallback: number, max = Number.MAX_SAFE_INTEGER) {
    if (!value)
        return fallback;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1)
        return fallback;
    return max ? Math.min(parsed, max) : parsed;
}
function getBearerToken(request: Request) {
    const header = request.headers.get('Authorization') || request.headers.get('authorization');
    if (!header)
        return null;
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || null;
}
function timingSafeEqualString(left: string, right: string) {
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
async function sha256Hex(value: string) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}
async function verifyAdminRequest(request: Request, runtimeEnv?: RuntimeEnv) {
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
    const adminConfig = await getAdminConfig(runtimeEnv);
    if (adminConfig.tokenSha256) {
        const candidateHash = await sha256Hex(token);
        return timingSafeEqualString(candidateHash, adminConfig.tokenSha256) ? null : json({ error: 'Invalid admin token' }, 403);
    }
    return json({ error: 'Admin token is not configured' }, 503);
}
async function handleAdminVerify(request: Request, runtimeEnv?: RuntimeEnv) {
    const authError = await verifyAdminRequest(request, runtimeEnv);
    if (authError)
        return authError;
    return json({ ok: true });
}
// ============================================================
// CORS helper
// ============================================================
function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '0',
    };
}
function noStoreHeaders() {
    return {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
        'CDN-Cache-Control': 'no-store',
        'Surrogate-Control': 'no-store',
        Pragma: 'no-cache',
        Expires: '0',
        Vary: 'Accept, Accept-Encoding',
    };
}
function json(body: unknown, status = 200) {
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
async function handleRandomImage(request: Request, runtimeEnv?: RuntimeEnv) {
    const url = new URL(request.url);
    const tag = url.searchParams.get('tag') || url.searchParams.get('type');
    const format = url.searchParams.get('format');
    const wantsJson = url.searchParams.has('json')
        || format === 'json'
        || url.searchParams.get('redirect') === 'false';
    const images = await getAllImages(runtimeEnv);
    if (images.length === 0) {
        return json({ error: 'No images available' }, 404);
    }
    let candidates = images;
    if (tag) {
        candidates = images.filter(img => img.tags.some(t => t.toLowerCase() === tag.toLowerCase()));
    }
    if (candidates.length === 0) {
        return json({ error: `No images found with tag: ${tag}` }, 404);
    }
    const randomIndex = Math.floor(Math.random() * candidates.length);
    const selected = candidates[randomIndex];
    // 异步更新统计（不阻塞响应）
    try {
        const stats = await getStats(runtimeEnv);
        const now = new Date();
        const today = getStatsDateKey(now);
        stats.totalRequests++;
        stats.lastRequestAt = now.toISOString();
        stats.dailyRequests[today] = (stats.dailyRequests[today] ?? 0) + 1;
        await saveStats(stats, runtimeEnv);
    }
    catch {
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
async function handleListImages(request: Request, runtimeEnv?: RuntimeEnv) {
    const url = new URL(request.url);
    const images = await getAllImages(runtimeEnv);
    const pageParam = url.searchParams.get('page');
    const pageSizeParam = url.searchParams.get('pageSize');
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const tag = url.searchParams.get('tag')?.trim() ?? '';
    if (!pageParam && !pageSizeParam && !search && !tag) {
        return json(images);
    }
    let filtered = images;
    if (tag) {
        filtered = filtered.filter(img => img.tags.some(item => item.toLowerCase() === tag.toLowerCase()));
    }
    if (search) {
        filtered = filtered.filter(img => img.title.toLowerCase().includes(search)
            || img.url.toLowerCase().includes(search)
            || img.tags.some(item => item.toLowerCase().includes(search)));
    }
    const pageSize = normalizePositiveInt(pageSizeParam, DEFAULT_LIST_PAGE_SIZE, MAX_LIST_PAGE_SIZE);
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(normalizePositiveInt(pageParam, 1), totalPages);
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
async function handleBatchCreateImages(request: Request, runtimeEnv?: RuntimeEnv) {
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
    const images = await getAllImages(runtimeEnv);
    const existingUrls = new Set(images.map(img => img.url));
    const results = [];
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
        const newImage = {
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
    await saveAllImages(images, runtimeEnv);
    const successCount = results.filter(r => r.success).length;
    return json({
        total: body.images.length,
        success: successCount,
        failed: body.images.length - successCount,
        results,
    }, 201);
}
// POST /api/create — 添加新图片
async function handleCreateImage(request: Request, runtimeEnv?: RuntimeEnv) {
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
    const images = await getAllImages(runtimeEnv);
    const newImage = {
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
    await saveAllImages(images, runtimeEnv);
    return json(newImage, 201);
}
// PUT /api/update/:id — 更新图片信息
async function handleUpdateImage(request: Request, id: string, runtimeEnv?: RuntimeEnv) {
    const body = await readJsonObject(request);
    if (!body) {
        return json({ error: 'Request body must be a valid JSON object' }, 400);
    }
    const images = await getAllImages(runtimeEnv);
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
    await saveAllImages(images, runtimeEnv);
    return json(images[index]);
}
// DELETE /api/delete/:id — 删除图片
async function handleDeleteImage(id: string, runtimeEnv?: RuntimeEnv) {
    const images = await getAllImages(runtimeEnv);
    const filtered = images.filter(img => img.id !== id);
    if (filtered.length === images.length) {
        return json({ error: 'Image not found' }, 404);
    }
    await saveAllImages(filtered, runtimeEnv);
    return json({ success: true, deletedId: id });
}
// GET /api/stats — 获取统计信息
async function handleStats(runtimeEnv?: RuntimeEnv) {
    const stats = await getStats(runtimeEnv);
    const images = await getAllImages(runtimeEnv);
    const today = getStatsDateKey();
    const recentDateKeys = getRecentStatsDateKeys();
    const dailyRequests = {};
    for (const dateKey of recentDateKeys) {
        dailyRequests[dateKey] = stats.dailyRequests[dateKey] || 0;
    }
    const tags = new Set<string>();
    for (const image of images) {
        for (const tag of image.tags) {
            tags.add(tag);
        }
    }
    return json({
        totalRequests: stats.totalRequests,
        todayRequests: stats.dailyRequests[today] || 0,
        lastRequestAt: stats.lastRequestAt,
        totalImages: images.length,
        dailyRequests,
        tags: Array.from(tags).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    });
}
// ============================================================
// Main fetch handler
// ============================================================
const handler = {
    async fetch(request: Request, runtimeEnv?: RuntimeEnv) {
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
        // GET /api/health
        if (pathname === '/api/health') {
            if (request.method === 'GET')
                return json({
                    ok: true,
                    runtime: 'edgeone-pages',
                    buildId: API_BUILD_ID,
                    timestamp: new Date().toISOString(),
                    kv: getKvHealth(runtimeEnv),
                });
            return json({ error: 'Method Not Allowed' }, 405);
        }

        // --- 路由匹配 ---
            // GET /api/random
            if (pathname === '/api/random') {
                if (request.method === 'GET')
                    return await handleRandomImage(request, runtimeEnv);
                return json({ error: 'Method Not Allowed' }, 405);
            }
            // GET /api/list
            if (pathname === '/api/list') {
                if (request.method === 'GET')
                    return await handleListImages(request, runtimeEnv);
                return json({ error: 'Method Not Allowed' }, 405);
            }
            // GET /api/admin/verify
            if (pathname === '/api/admin/verify') {
                if (request.method === 'GET')
                    return await handleAdminVerify(request, runtimeEnv);
                return json({ error: 'Method Not Allowed' }, 405);
            }
            // POST /api/batch
            if (pathname === '/api/batch') {
                if (request.method === 'POST') {
                    const authError = await verifyAdminRequest(request, runtimeEnv);
                    if (authError)
                        return authError;
                    return await handleBatchCreateImages(request, runtimeEnv);
                }
                return json({ error: 'Method Not Allowed' }, 405);
            }
            // POST /api/create
            if (pathname === '/api/create') {
                if (request.method === 'POST') {
                    const authError = await verifyAdminRequest(request, runtimeEnv);
                    if (authError)
                        return authError;
                    return await handleCreateImage(request, runtimeEnv);
                }
                return json({ error: 'Method Not Allowed' }, 405);
            }
            // PUT /api/update/:id
            const updateMatch = pathname.match(/^\/api\/update\/(.+)$/);
            if (updateMatch) {
                if (request.method === 'PUT') {
                    const authError = await verifyAdminRequest(request, runtimeEnv);
                    if (authError)
                        return authError;
                    return await handleUpdateImage(request, updateMatch[1], runtimeEnv);
                }
                return json({ error: 'Method Not Allowed' }, 405);
            }
            // DELETE /api/delete/:id
            const deleteMatch = pathname.match(/^\/api\/delete\/(.+)$/);
            if (deleteMatch) {
                if (request.method === 'DELETE') {
                    const authError = await verifyAdminRequest(request, runtimeEnv);
                    if (authError)
                        return authError;
                    return await handleDeleteImage(deleteMatch[1], runtimeEnv);
                }
                return json({ error: 'Method Not Allowed' }, 405);
            }
            // GET /api/stats
            if (pathname === '/api/stats') {
                if (request.method === 'GET')
                    return await handleStats(runtimeEnv);
                return json({ error: 'Method Not Allowed' }, 405);
            }
            // 404
            return json({ error: 'Not Found' }, 404);
        }
        catch (err) {
            // 捕获所有未预期的运行时错误，防止 ER 进程崩溃
            console.error('Unhandled error:', err);
            return json({
                error: 'Internal Server Error',
                buildId: API_BUILD_ID,
            }, 500);
        }
    },
};
async function onRequest(context: EdgeOnePagesContext) {
    return handler.fetch(context.request, context.env);
}
export default onRequest;
export { handler };
export { onRequest };
export { getRecentStatsDateKeys, getStatsDateKey };
