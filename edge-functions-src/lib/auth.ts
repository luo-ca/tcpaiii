// Admin authentication: Bearer token extraction, SHA-256 verification.

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

export async function verifyAdminRequest(request: Request, runtimeEnv?: RuntimeEnv) {
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

export async function handleAdminVerify(request: Request, runtimeEnv?: RuntimeEnv) {
    const authError = await verifyAdminRequest(request, runtimeEnv);
    if (authError)
        return authError;
    return json({ ok: true });
}
