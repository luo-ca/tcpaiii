// ============================================================
// URL Utilities
// ============================================================

import { APP_FALLBACK_DOMAIN, EDGEONE_PREVIEW_QUERY_KEYS } from './constants';

export function getAppOrigin(): string {
  if (typeof window === 'undefined') return APP_FALLBACK_DOMAIN;
  return window.location.origin;
}

export function appendCurrentPreviewParams(url: URL): URL {
  if (typeof window === 'undefined') return url;

  const currentParams = new URLSearchParams(window.location.search);
  for (const key of EDGEONE_PREVIEW_QUERY_KEYS) {
    const value = currentParams.get(key);
    if (value && !url.searchParams.has(key)) {
      url.searchParams.set(key, value);
    }
  }

  return url;
}

export function buildAppUrl(path: string): string {
  const url = new URL(path, getAppOrigin());
  return appendCurrentPreviewParams(url).toString();
}

export function buildApiPath(path: string): string {
  if (typeof window === 'undefined') return path;
  const url = appendCurrentPreviewParams(new URL(path, window.location.origin));
  return url.pathname + url.search + url.hash;
}
