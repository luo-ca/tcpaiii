// ============================================================
// API Client — unified HTTP layer
// ============================================================

import type { ApiErrorPayload } from './types';
import { API_HTML_FALLBACK_MESSAGE } from './constants';
import { appendCurrentPreviewParams, buildApiPath } from './url';

// ---- internal helpers ----

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  return typeof value === 'object' && value !== null;
}

function isJsonContentType(contentType: string): boolean {
  return contentType.includes('application/json') || contentType.includes('+json');
}

function isLikelyHtmlResponse(contentType: string, body: string): boolean {
  const normalizedBody = body.trim().slice(0, 200).toLowerCase();
  return (
    contentType.includes('text/html') ||
    normalizedBody.startsWith('<!doctype') ||
    normalizedBody.startsWith('<html') ||
    normalizedBody.includes('<head')
  );
}

function summarizeBody(body: string): string {
  return body.trim().replace(/\s+/g, ' ').slice(0, 140);
}

async function readTextSafely(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function getNonJsonApiMessage(response: Response, body: string, fallback: string): string {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

  if (isLikelyHtmlResponse(contentType, body)) {
    return API_HTML_FALLBACK_MESSAGE;
  }

  const summary = summarizeBody(body);
  if (summary) {
    return `${fallback}：接口返回了非 JSON 内容（${summary}）`;
  }

  return `${fallback}：接口返回了非 JSON 内容`;
}

// ---- exported helpers ----

export function withNoCacheQuery(input: RequestInfo | URL, init?: RequestInit): RequestInfo | URL {
  const method = (
    init?.method || (input instanceof Request ? input.method : undefined) || 'GET'
  ).toUpperCase();
  if (method !== 'GET') return input;

  const cacheBustValue = String(Date.now());

  if (typeof input === 'string') {
    const url = new URL(buildApiPath(input), window.location.origin);
    url.searchParams.set('_t', cacheBustValue);
    return url.pathname + url.search + url.hash;
  }

  if (input instanceof URL) {
    const nextUrl = appendCurrentPreviewParams(new URL(input.toString()));
    nextUrl.searchParams.set('_t', cacheBustValue);
    return nextUrl;
  }

  if (input instanceof Request) {
    const nextUrl = appendCurrentPreviewParams(new URL(input.url));
    nextUrl.searchParams.set('_t', cacheBustValue);
    return new Request(nextUrl.toString(), input);
  }

  return input;
}

export async function getApiErrorMessage(response: Response, fallback: string): Promise<string> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

  try {
    if (isJsonContentType(contentType)) {
      const payload = await response.clone().json();
      if (isApiErrorPayload(payload)) {
        return payload.error || payload.message || fallback;
      }
    }
  } catch {
    // Non-JSON error bodies are handled by the fallback below.
  }

  const body = await readTextSafely(response.clone());
  return getNonJsonApiMessage(response, body, fallback);
}

/**
 * Generic, robust API request wrapper.
 * - Adds cache-busting to GET requests (opt-out via `opts.bustCache: false`
 *   for idempotent list queries that benefit from CDN/edge caching)
 * - Validates JSON content-type
 * - Extracts meaningful error messages
 */
/**
 * 给任意形态的请求目标补上 EdgeOne 预览参数。
 *
 * 与 withNoCacheQuery 的 `_t` 无关 —— 预览链接（?eo_token=…）上**每一个** API
 * 请求都必须带这组参数，少了它请求会打到线上部署：预览页读到的是生产数据，
 * 管理员一次「添加图片」直接写进生产库。原先只有「GET + 破缓」这条路径顺带补过
 * （buildApiPath 在 withNoCacheQuery 里），stats / 分页 list / 全部写请求都在漏。
 */
function appendPreviewParams(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input === 'string') return buildApiPath(input);

  if (input instanceof URL) {
    return appendCurrentPreviewParams(new URL(input.toString()));
  }

  if (input instanceof Request) {
    const nextUrl = appendCurrentPreviewParams(new URL(input.url));
    // 参数已在（或不该加）时原样返回，省掉一次 Request body 搬运
    if (nextUrl.toString() === input.url) return input;
    return new Request(nextUrl.toString(), input);
  }

  return input;
}

export async function apiRequest<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  fallback: string,
  opts?: { bustCache?: boolean },
): Promise<T> {
  const bustCache = opts?.bustCache ?? true;
  // 预览参数是硬契约，先无条件补齐；`_t` 破缓仍只管 GET
  const target = appendPreviewParams(input);
  const response = await fetch(bustCache ? withNoCacheQuery(target, init) : target, {
    ...init,
    // bustCache 关闭时交给服务端 Cache-Control 说话（后端已给
    // stats/分页 list 发短边缘缓存）；强推 no-store 会让那套契约形同虚设
    cache: bustCache ? 'no-store' : 'default',
  });
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response, fallback));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (!isJsonContentType(contentType)) {
    const body = await readTextSafely(response.clone());
    throw new Error(getNonJsonApiMessage(response, body, fallback));
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(`${fallback}: invalid JSON response`);
  }
}
