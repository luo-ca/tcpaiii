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

export type AppTab = 'random' | 'gallery' | 'docs';

export type ApiErrorPayload = {
  error?: string;
  message?: string;
};

export type AdminAuthStatus = 'empty' | 'unverified' | 'checking' | 'valid' | 'invalid' | 'unconfigured';

export type LazyImageState = 'idle' | 'loading' | 'loaded' | 'error';
