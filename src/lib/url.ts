// ============================================================
// URL Utilities
// ============================================================

import {
  APP_FALLBACK_DOMAIN,
  EDGEONE_PREVIEW_QUERY_KEYS,
  MAX_SEARCH_LENGTH,
  MAX_TAG_LENGTH,
} from './constants';
import { stripControlChars } from './text';

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

// ============================================================
// 图库筛选状态的地址栏序列化
// ============================================================

/**
 * 图库筛选状态的地址栏键名。
 *
 * 筛选结果原先只活在组件 state 里：把链接发给别人，对方看到的是整库；
 * 刷新一下筛选就没了；后退键也退不回上一个标签。
 * 把 `q`（标题关键词）与 `tag`（标签）同步进查询串后，筛选结果可分享、可刷新、可后退。
 *
 * 这里的读写都写成「入参即查询串、返回即结果」的纯函数，
 * 不直接碰 `window` —— 否则这段最容易出错的逻辑（保留 eo_token 等未知参数）无从验证。
 */
export const GALLERY_QUERY_SEARCH = 'q';
export const GALLERY_QUERY_TAG = 'tag';

/** 清洗 + 重新 trim：剔完控制字符可能露出首尾空白。 */
function sanitizeQueryValue(raw: string | null): string {
  return stripControlChars(raw ?? '').trim();
}

export function readGalleryQuery(search: string): { search: string; tag: string | null } {
  const params = new URLSearchParams(search);
  // 长度必须在这里收口，不能只靠输入框的 maxLength —— 那个只挡打字，
  // 挡不住手工构造或他人分享的超长链接。不收口会让地址栏与请求条件分裂：
  // 后端 /api/list 会把 search 截到 100、tag 截到 40
  //（edge-functions-src/lib/types.ts），于是**实际生效的筛选与地址栏里的不是同一个**，
  // 「复制链接分享」也复现不出用户看到的结果。
  // 先 trim 再 slice：不把空白算进额度（与输入框 maxLength 的语义一致）。
  const rawSearch = sanitizeQueryValue(params.get(GALLERY_QUERY_SEARCH));
  const rawTag = sanitizeQueryValue(params.get(GALLERY_QUERY_TAG));
  return {
    search: rawSearch.slice(0, MAX_SEARCH_LENGTH),
    tag: rawTag ? rawTag.slice(0, MAX_TAG_LENGTH) : null,
  };
}

/**
 * 把筛选状态写回查询串。
 *
 * 以现有查询串为起点增删，**不是重建** —— 否则 `eo_token` / `eo_time` 这类
 * EdgeOne 预览参数会被抹掉，预览链接当场失效。
 * 返回不带 `?` 的查询串（无参时为空串）。
 */
export function writeGalleryQuery(
  currentSearch: string,
  next: { search: string; tag: string | null },
): string {
  const params = new URLSearchParams(currentSearch);
  const keyword = next.search.trim();

  if (keyword) params.set(GALLERY_QUERY_SEARCH, keyword);
  else params.delete(GALLERY_QUERY_SEARCH);

  if (next.tag) params.set(GALLERY_QUERY_TAG, next.tag);
  else params.delete(GALLERY_QUERY_TAG);

  return params.toString();
}
