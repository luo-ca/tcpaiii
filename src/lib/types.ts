// ============================================================
// Shared Types
// ============================================================

export interface ImageRecord {
  id: string;
  url: string;
  title: string;
  tags: string[];
  createdAt: string;
}

export interface Stats {
  totalRequests: number;
  todayRequests: number;
  lastRequestAt: string | null;
  totalImages: number;
  totalSites?: number;
  dailyRequests?: Record<string, number>;
  tags: string[];
}

export interface PaginatedImages {
  items: ImageRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
}

/**
 * 首页「换一张 / 按标签搜索」的信号。
 * `token` 每次递增即代表发起一次新请求 —— 用递增数字而不是布尔量，
 * 保证「连续点两次同样的标签」也能各触发一次。
 */
export interface RandomRequest {
  tag?: string;
  token: number;
}

export type ApiErrorPayload = {
  error?: string;
  message?: string;
};

export type AdminAuthStatus = 'empty' | 'unverified' | 'checking' | 'valid' | 'invalid' | 'unconfigured';

export type LazyImageState = 'idle' | 'loading' | 'loaded' | 'error';
