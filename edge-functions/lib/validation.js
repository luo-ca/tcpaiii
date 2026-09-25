// Validation and normalisation helpers for URLs, IDs, tags, sites, etc.
import { ALLOWED_IMAGE_PROTOCOLS, IMAGE_ID_PATTERN, MAX_IMAGE_URL_LENGTH, MAX_JSON_BODY_BYTES, MAX_TAG_LENGTH, MAX_TAGS_PER_IMAGE, MAX_TITLE_LENGTH, } from './types';
export function isJsonObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export async function readJsonObject(request) {
    try {
        const contentLength = Number(request.headers.get('content-length'));
        if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
            return null;
        }
        const body = await request.text();
        if (!body || new TextEncoder().encode(body).byteLength > MAX_JSON_BODY_BYTES) {
            return null;
        }
        const parsed = JSON.parse(body);
        return isJsonObject(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
}
export function isSha256Hex(value) {
    return /^[a-f0-9]{64}$/i.test(value);
}
export function normalizeImageUrl(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > MAX_IMAGE_URL_LENGTH)
        return null;
    try {
        const parsed = new URL(trimmed);
        if (!ALLOWED_IMAGE_PROTOCOLS.has(parsed.protocol) || parsed.username || parsed.password) {
            return null;
        }
        const canonical = parsed.toString();
        // 百分号转义会让规范化结果比原串更长：两关都要过
        return canonical.length <= MAX_IMAGE_URL_LENGTH ? canonical : null;
    }
    catch {
        return null;
    }
}
export function isValidImageId(value) {
    return IMAGE_ID_PATTERN.test(value);
}
export function isAscii(value) {
    return Array.from(value).every(char => char.charCodeAt(0) <= 0x7F);
}
export function decodeRouteSegment(value) {
    try {
        return decodeURIComponent(value);
    }
    catch {
        return null;
    }
}
export function sortTags(tags) {
    return tags.sort((left, right) => {
        const leftAscii = isAscii(left);
        const rightAscii = isAscii(right);
        if (leftAscii !== rightAscii)
            return leftAscii ? -1 : 1;
        return left.localeCompare(right, 'zh-CN');
    });
}
/**
 * 剔除 C0/C1 控制字符与 DEL。
 *
 * 与前端 src/lib/text.ts 的 stripControlChars 同一套规则，这里在服务端再挡一道 ——
 * 两条路径的输入控制不住：
 *   · /api/create、/api/batch 是可被直接调用的公开接口，绕过前端表单就能塞脏数据；
 *   · KV 可能被手工改过，或存着更早期没有这道校验时写入的记录。
 *
 * 控制字符的危害不是「看起来乱」而是**零宽**：标题里的 NUL 在界面上完全看不见，
 * 却会进到 aria-label 里 —— 读屏软件遇到 NUL 可能提前截断或整段跳过，
 * 用户听到的是一个残缺甚至空白的标题，而肉眼排查时什么都看不到。
 *
 * 只剔控制字符，不做「只留字母数字」那种激进过滤：标签合法地包含中文、emoji、空格。
 */
export function stripControlChars(value) {
    // eslint-disable-next-line no-control-regex
    return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
}
export function normalizeTitle(value, fallback = '未命名图片') {
    if (typeof value !== 'string')
        return fallback;
    // 先去控制字符再 trim：'\u0000'.trim() 仍是非空串，只 trim 会把纯控制字符当合法标题
    const trimmed = stripControlChars(value).trim();
    return trimmed ? trimmed.slice(0, MAX_TITLE_LENGTH) : fallback;
}
export function normalizeTags(value) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value))
        return null;
    if (value.some(tag => typeof tag !== 'string'))
        return null;
    const tags = value
        .map(tag => stripControlChars(tag).trim())
        .map(tag => tag.slice(0, MAX_TAG_LENGTH))
        .filter(Boolean);
    return [...new Set(tags)].slice(0, MAX_TAGS_PER_IMAGE);
}
export function normalizePositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
    if (!value)
        return fallback;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1)
        return fallback;
    return max ? Math.min(parsed, max) : parsed;
}
export function isValidHostname(value) {
    if (!value || value.length > 253)
        return false;
    if (value === 'localhost')
        return true;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) {
        return value.split('.').every(part => {
            const parsed = Number(part);
            return Number.isInteger(parsed) && parsed >= 0 && parsed <= 255;
        });
    }
    return value.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
}
export function isValidSiteKey(value) {
    const [hostname, port, extra] = value.split(':');
    if (extra !== undefined || !isValidHostname(hostname))
        return false;
    if (port === undefined)
        return true;
    if (!/^\d{1,5}$/.test(port))
        return false;
    const parsedPort = Number(port);
    return parsedPort >= 1 && parsedPort <= 65535;
}
export function getRequestSite(request) {
    const source = request.headers.get('Origin') || request.headers.get('Referer');
    if (!source)
        return null;
    try {
        const parsed = new URL(source);
        if (!ALLOWED_IMAGE_PROTOCOLS.has(parsed.protocol))
            return null;
        const site = `${parsed.hostname.toLowerCase()}${parsed.port ? `:${parsed.port}` : ''}`;
        return isValidSiteKey(site) ? site : null;
    }
    catch {
        return null;
    }
}
