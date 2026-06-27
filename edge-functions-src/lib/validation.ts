// Validation and normalisation helpers for URLs, IDs, tags, sites, etc.

import {
    ALLOWED_IMAGE_PROTOCOLS,
    IMAGE_ID_PATTERN,
    MAX_JSON_BODY_BYTES,
    MAX_TAG_LENGTH,
    MAX_TAGS_PER_IMAGE,
    MAX_TITLE_LENGTH,
} from './types';

export function isJsonObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
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

export function isSha256Hex(value: string) {
    return /^[a-f0-9]{64}$/i.test(value);
}

export function normalizeImageUrl(value: unknown): string | null {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    try {
        const parsed = new URL(trimmed);
        if (!ALLOWED_IMAGE_PROTOCOLS.has(parsed.protocol) || parsed.username || parsed.password) {
            return null;
        }
        return parsed.toString();
    }
    catch {
        return null;
    }
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

export function normalizeTitle(value: unknown, fallback = '未命名图片') {
    if (typeof value !== 'string')
        return fallback;
    const trimmed = value.trim();
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
        .map(tag => tag.trim())
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
