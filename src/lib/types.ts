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

/**
 * GET /api/health 的响应。后端字段（[[default]].ts 的 health 分支 +
 * kv.ts 的 getKvHealth）—— 改任何一侧都要同步，状态页直接消费。
 */
export interface HealthPayload {
  ok: boolean;
  runtime: string;
  buildId: string;
  timestamp: string;
  kv: {
    imagesBound: boolean;
    statsBound: boolean;
  };
}
