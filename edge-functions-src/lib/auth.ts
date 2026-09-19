// Admin authentication: Bearer token extraction, SHA-256 verification,
// per-client failure throttling.

import type { RuntimeEnv } from './types';

import { json } from './response';
import { getAdminConfig, getRuntimeSecret } from './kv';

export function getBearerToken(request: Request) {
    const header = request.headers.get('Authorization') || request.headers.get('authorization');
    if (!header)
        return null;
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || null;
}

export function timingSafeEqualString(left: string, right: string) {
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

export async function sha256Hex(value: string) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

// ── Failure throttling ───────────────────────────────────────
// 校验要算 SHA-256 还可能打一次 KV：不限流的话，单个脚本就能把
// 管理端点变成 KV 读放大器。按客户端 IP 记失败次数，超阈值回 429。
// 503（服务端未配置密钥）不计——那不是调用方的错。

const ADMIN_FAIL_WINDOW_MS = 60_000;
const ADMIN_FAIL_MAX = 20;
const ADMIN_FAIL_TRACKED_MAX = 5_000;

type FailureEntry = { count: number; resetAt: number };
const _adminFailures = new Map<string, FailureEntry>();

export function resetAdminThrottle() {
    _adminFailures.clear();
}

function throttleKey(request: Request) {
    const forwarded = request.headers.get('x-forwarded-for');
    const firstHop = forwarded?.split(',')[0]?.trim();
    return firstHop || request.headers.get('x-real-ip') || 'local';
}

function throttleBlockedResponse(request: Request): Response | null {
    const key = throttleKey(request);
    const entry = _adminFailures.get(key);
    if (!entry)
        return null;
    const now = Date.now();
    if (now >= entry.resetAt) {
        _adminFailures.delete(key);
        return null;
    }
    if (entry.count < ADMIN_FAIL_MAX)
        return null;
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1_000));
    return json(
        { error: 'Too many failed admin attempts, try again later' },
        429,
        { headers: { 'Retry-After': String(retryAfter) } },
    );
}

function recordAdminFailure(request: Request) {
    const key = throttleKey(request);
    const now = Date.now();
    const entry = _adminFailures.get(key);
    if (!entry || now >= entry.resetAt) {
        // 近似 LRU：Map 过长先清已过窗口的，再兜底整体清空，防内存涨死
        if (_adminFailures.size >= ADMIN_FAIL_TRACKED_MAX) {
            for (const [tracked, trackedEntry] of _adminFailures) {
                if (now >= trackedEntry.resetAt)
                    _adminFailures.delete(tracked);
            }
            if (_adminFailures.size >= ADMIN_FAIL_TRACKED_MAX)
                _adminFailures.clear();
        }
        _adminFailures.set(key, { count: 1, resetAt: now + ADMIN_FAIL_WINDOW_MS });
        return;
    }
    entry.count += 1;
}

async function verifyAdminToken(request: Request, runtimeEnv?: RuntimeEnv) {
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

export async function verifyAdminRequest(request: Request, runtimeEnv?: RuntimeEnv) {
    const blocked = throttleBlockedResponse(request);
    if (blocked)
        return blocked;
    const error = await verifyAdminToken(request, runtimeEnv);
    if (error) {
        if (error.status === 401 || error.status === 403)
            recordAdminFailure(request);
        return error;
    }
    _adminFailures.delete(throttleKey(request));
    return null;
}

export async function handleAdminVerify(request: Request, runtimeEnv?: RuntimeEnv) {
    const authError = await verifyAdminRequest(request, runtimeEnv);
    if (authError)
        return authError;
    return json({ ok: true });
}
