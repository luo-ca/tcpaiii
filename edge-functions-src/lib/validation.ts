// Validation and normalisation helpers for URLs, IDs, tags, sites, etc.

import {
    ALLOWED_IMAGE_PROTOCOLS,
    IMAGE_ID_PATTERN,
    MAX_IMAGE_URL_LENGTH,
    MAX_JSON_BODY_BYTES,
    MAX_TAG_LENGTH,
    MAX_TAGS_PER_IMAGE,
    MAX_TITLE_LENGTH,
} from './types';

export function isJsonObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 读取并解析 JSON 请求体。
 *
 * 返回值区分三种失败，调用方要能分辨（原先统一返回 null，于是
 * 「体积超限」被当成「JSON 格式错误」报出去）：
 *   · 'too-large' —— 超出 MAX_JSON_BODY_BYTES，报文体积问题；
 *   · 'invalid'   —— 空体 / 非 UTF-8 超限 / JSON.parse 失败 / 不是对象；
 *   · 对象本身     —— 解析成功。
 *
 * 为什么必须分开：MAX_BATCH_SIZE(500) × MAX_IMAGE_URL_LENGTH(2048) 序列化后
 * 约 1MB，是请求体上限的 ~4 倍。一批**完全合法**的长 URL 会栽在体积上，
 * 而原先的报文说「Request body must be a valid JSON object」—— 用户按提示
 * 逐条检查 URL，永远找不到问题，且 500 还在客户端声明的上限之内。
 */
export type ReadJsonBodyResult =
    | { ok: true; body: Record<string, unknown> }
    | { ok: false; reason: 'too-large' | 'invalid' };

export async function readJsonBody(request: Request): Promise<ReadJsonBodyResult> {
    // content-length 只是提示，可以缺失或撒谎，所以文本读完后必须再按字节数判一次
    const contentLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
        return { ok: false, reason: 'too-large' };
    }
    let body: string;
    try {
        body = await request.text();
    }
    catch {
        return { ok: false, reason: 'invalid' };
    }
    // 按**字节**判而不是 body.length：非 ASCII 每字符占多字节
    if (new TextEncoder().encode(body).byteLength > MAX_JSON_BODY_BYTES) {
        return { ok: false, reason: 'too-large' };
    }
    try {
        const parsed = JSON.parse(body);
        return isJsonObject(parsed) ? { ok: true, body: parsed } : { ok: false, reason: 'invalid' };
    }
    catch {
        // 含空体："".length 是 0，JSON.parse('') 抛 SyntaxError —— 与旧实现的 !body 同结果
        return { ok: false, reason: 'invalid' };
    }
}

export function isSha256Hex(value: string) {
    return /^[a-f0-9]{64}$/i.test(value);
}

/**
 * 图片地址规范化的结果。
 *
 * 区分 'too-long' 与 'invalid'，因为调用方要能给出**不同**的报错：
 * 超长的地址本身是合法的 http(s) 地址（浏览器能打开），只是太长。
 * 把它混进「不是有效的 http(s) 地址」里，用户会去逐字检查地址格式，
 * 而真正该做的是换一条短一点的地址 —— 提示指错了方向。
 */
export type NormalizedImageUrl =
    | { ok: true; url: string }
    | { ok: false; reason: 'too-long' | 'invalid' };

export function normalizeImageUrlWithReason(value: unknown): NormalizedImageUrl {
    if (typeof value !== 'string')
        return { ok: false, reason: 'invalid' };
    const trimmed = value.trim();
    if (!trimmed)
        return { ok: false, reason: 'invalid' };
    if (trimmed.length > MAX_IMAGE_URL_LENGTH)
        return { ok: false, reason: 'too-long' };
    try {
        const parsed = new URL(trimmed);
        if (!ALLOWED_IMAGE_PROTOCOLS.has(parsed.protocol) || parsed.username || parsed.password) {
            return { ok: false, reason: 'invalid' };
        }
        const canonical = parsed.toString();
        // 百分号转义会让规范化结果比原串更长：两关都要过。
        // 这一条尤其容易让人困惑 —— 输入明明 ≤ 上限，却在这里被判超长。
        return canonical.length <= MAX_IMAGE_URL_LENGTH
            ? { ok: true, url: canonical }
            : { ok: false, reason: 'too-long' };
    }
    catch {
        return { ok: false, reason: 'invalid' };
    }
}
export function normalizeImageUrl(value: unknown): string | null {
    const result = normalizeImageUrlWithReason(value);
    return result.ok ? result.url : null;
}

export function isValidImageId(value: string) {
    return IMAGE_ID_PATTERN.test(value);
}

export function isAscii(value: string) {
    return Array.from(value).every(char => char.charCodeAt(0) <= 0x7F);
}

export function decodeRouteSegment(value: string) {
    try {
        return decodeURIComponent(value);
    }
    catch {
        return null;
    }
}

export function sortTags(tags: string[]) {
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
export function stripControlChars(value: string): string {
    // eslint-disable-next-line no-control-regex
    return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
}

export function normalizeTitle(value: unknown, fallback = '未命名图片') {
    if (typeof value !== 'string')
        return fallback;
    // 先去控制字符再 trim：'\u0000'.trim() 仍是非空串，只 trim 会把纯控制字符当合法标题
    const trimmed = stripControlChars(value).trim();
    return trimmed ? trimmed.slice(0, MAX_TITLE_LENGTH) : fallback;
}

export function normalizeTags(value: unknown): string[] | null {
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

export function normalizePositiveInt(value: string | null, fallback: number, max = Number.MAX_SAFE_INTEGER) {
    if (!value)
        return fallback;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1)
        return fallback;
    return max ? Math.min(parsed, max) : parsed;
}

export function isValidHostname(value: string) {
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

export function isValidSiteKey(value: string) {
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

export function getRequestSite(request: Request) {
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
