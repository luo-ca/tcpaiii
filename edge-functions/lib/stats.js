// Stats update, query, and date-utility helpers.
import { KV_CACHE_TTL_MS, MAX_TRACKED_SITES, READ_CACHE_CONTROL, STATS_TIME_ZONE, } from './types';
import { json } from './response';
import { getRequestSite, isJsonObject, isValidSiteKey } from './validation';
import { getImagesMeta, getKvStats, parseStoredJson } from './kv';
// ── Module state ─────────────────────────────────────────────
let _cachedStatsState = null;
export function resetStatsCache() {
    _cachedStatsState = null;
}
// ── Date utilities ───────────────────────────────────────────
export function getStatsDateKey(date = new Date()) {
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
export function isStatsDateKey(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
export function normalizeStatCount(value) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, Math.floor(value))
        : 0;
}
export function getRecentStatsDateKeys(days = 7, date = new Date()) {
    return Array.from({ length: days }, (_, index) => {
        const day = new Date(date);
        day.setUTCDate(day.getUTCDate() - (days - index - 1));
        return getStatsDateKey(day);
    });
}
// ── Stats record helpers ─────────────────────────────────────
export function cloneStatsRecord(stats) {
    return {
        totalRequests: stats.totalRequests,
        lastRequestAt: stats.lastRequestAt,
        dailyRequests: { ...stats.dailyRequests },
        sites: { ...stats.sites },
    };
}
function getCachedStatsState(stats) {
    return {
        expiresAt: Date.now() + KV_CACHE_TTL_MS,
        stats: cloneStatsRecord(stats),
    };
}
function pruneSites(sites) {
    return Object.fromEntries(Object.entries(sites)
        .sort((left, right) => right[1] - left[1])
        .slice(0, MAX_TRACKED_SITES));
}
// ── Stats data access ────────────────────────────────────────
export async function getStats(runtimeEnv) {
    if (_cachedStatsState && _cachedStatsState.expiresAt > Date.now()) {
        return cloneStatsRecord(_cachedStatsState.stats);
    }
    const data = await getKvStats(runtimeEnv).get('data');
    if (!data) {
        const emptyStats = { totalRequests: 0, lastRequestAt: null, dailyRequests: {}, sites: {} };
        _cachedStatsState = getCachedStatsState(emptyStats);
        return cloneStatsRecord(emptyStats);
    }
    const parsed = parseStoredJson(data, {});
    const parsedStats = isJsonObject(parsed) ? parsed : {};
    const dailyRequests = {};
    if (isJsonObject(parsedStats.dailyRequests)) {
        for (const [dateKey, count] of Object.entries(parsedStats.dailyRequests)) {
            if (isStatsDateKey(dateKey)) {
                dailyRequests[dateKey] = normalizeStatCount(count);
            }
        }
    }
    const sites = {};
    if (isJsonObject(parsedStats.sites)) {
        for (const [site, count] of Object.entries(parsedStats.sites)) {
            if (typeof site === 'string' && isValidSiteKey(site)) {
                sites[site] = normalizeStatCount(count);
            }
        }
    }
    const stats = {
        totalRequests: normalizeStatCount(parsedStats.totalRequests),
        lastRequestAt: typeof parsedStats.lastRequestAt === 'string' && !Number.isNaN(Date.parse(parsedStats.lastRequestAt))
            ? parsedStats.lastRequestAt
            : null,
        dailyRequests,
        sites,
    };
    _cachedStatsState = getCachedStatsState(stats);
    return cloneStatsRecord(stats);
}
export async function saveStats(stats, runtimeEnv) {
    await getKvStats(runtimeEnv).put('data', JSON.stringify(stats));
    _cachedStatsState = getCachedStatsState(stats);
}
// ── Stats update (called on every random-image request) ──────
// 整段「读快照 → 自增 → 写回」必须排队执行：/api/random 是热路径，
// 只把写排队（saveAllImages 当年的修法）不够——stats 的读与写之间同样让出
// 控制权，并发请求各自读到同一份旧快照、各自 +1 后互相覆盖，
// 「累计/今日调用」静默少计。链尾吞掉异常：一次写失败不能卡死后续所有统计，
// 异常照常回传给本次调用方（热路径对它的处理本来就是 catch）。
let _statsQueue = Promise.resolve();
export function updateRequestStats(request, runtimeEnv) {
    const task = _statsQueue.then(async () => {
        const stats = await getStats(runtimeEnv);
        const now = new Date();
        const today = getStatsDateKey(now);
        stats.totalRequests++;
        stats.lastRequestAt = now.toISOString();
        stats.dailyRequests[today] = (stats.dailyRequests[today] ?? 0) + 1;
        const site = getRequestSite(request);
        if (site) {
            stats.sites[site] = (stats.sites[site] ?? 0) + 1;
            stats.sites = pruneSites(stats.sites);
        }
        await saveStats(stats, runtimeEnv);
    });
    _statsQueue = task.catch(() => undefined);
    return task;
}
// ── Route handler: GET /api/stats ────────────────────────────
export async function handleStats(runtimeEnv) {
    const stats = await getStats(runtimeEnv);
    const imagesMeta = await getImagesMeta(runtimeEnv);
    const today = getStatsDateKey();
    const recentDateKeys = getRecentStatsDateKeys();
    const dailyRequests = {};
    for (const dateKey of recentDateKeys) {
        dailyRequests[dateKey] = stats.dailyRequests[dateKey] || 0;
    }
    return json({
        totalRequests: stats.totalRequests,
        todayRequests: stats.dailyRequests[today] || 0,
        lastRequestAt: stats.lastRequestAt,
        totalImages: imagesMeta.totalImages,
        totalSites: Object.keys(stats.sites).length,
        dailyRequests,
        tags: imagesMeta.tags,
    }, 200, { cacheControl: READ_CACHE_CONTROL });
}
