import { lazy, Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  Camera,
  Shuffle,
  Copy,
  ExternalLink,
  BarChart3,
  Image,
  Loader2,
  Sparkles,
  Tag,
  Link,
  Check,
  Code,
  Globe,
  Shield,
  Zap,
  Database,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Clock,
  Layers,
  Heart,
  Mail,
  MessageSquare,
  Copy as CopyIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/utils';

const GalleryPage = lazy(() => import('@/features/gallery-page'));
const DocsPage = lazy(() => import('@/features/docs-page'));
const RandomPage = lazy(() => import('@/features/random-page'));

// ============================================================
// Types
// ============================================================

interface ImageRecord {
  id: string;
  url: string;
  title: string;
  tags: string[];
  createdAt: string;
}

interface Stats {
  totalRequests: number;
  todayRequests: number;
  lastRequestAt: string | null;
  totalImages: number;
  totalSites?: number;
  dailyRequests?: Record<string, number>;
  tags: string[];
}

interface PaginatedImages {
  items: ImageRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
}

type AppTab = 'random' | 'gallery' | 'docs';

type ApiErrorPayload = {
  error?: string;
  message?: string;
};

type AdminAuthStatus = 'empty' | 'unverified' | 'checking' | 'valid' | 'invalid' | 'unconfigured';

const API_HTML_FALLBACK_MESSAGE = 'API returned HTML instead of JSON. Please check whether the Edge function is deployed correctly.';

const HEADER_TABS: Array<{ key: AppTab; label: string; icon: typeof Shuffle }> = [
  { key: 'random', label: '闅忔満', icon: Shuffle },
  { key: 'gallery', label: '鍥惧簱', icon: Image },
  { key: 'docs', label: 'API 鏂囨。', icon: Code },
];

const APP_NAME = '娲炬鍏?API';
const APP_FALLBACK_DOMAIN = 'https://t.paiii.cn';
const APP_LOGO_URL = 'https://static.paiii.cn/logo.svg';
const EDGEONE_LOGO_URL = 'https://edgeone.ai/_next/static/media/headLogo.daeb48ad.png';
const MAX_BATCH_IMAGE_COUNT = 500;
const GALLERY_PAGE_SIZE = 24;
const GALLERY_PAGE_SIZE_OPTIONS = [12, 24, 36, 60] as const;
const EDGEONE_PREVIEW_QUERY_KEYS = ['eo_token', 'eo_time'] as const;

function getAppOrigin(): string {
  if (typeof window === 'undefined') return APP_FALLBACK_DOMAIN;
  return window.location.origin;
}

function appendCurrentPreviewParams(url: URL): URL {
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

function buildAppUrl(path: string): string {
  const url = new URL(path, getAppOrigin());
  return appendCurrentPreviewParams(url).toString();
}

function buildApiPath(path: string): string {
  if (typeof window === 'undefined') return path;
  const url = appendCurrentPreviewParams(new URL(path, window.location.origin));
  return url.pathname + url.search + url.hash;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function parseTagsInput(value: string): string[] {
  return [...new Set(value.split(/[,，]/).map(tag => tag.trim()).filter(Boolean))];
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getVisiblePages(currentPage: number, totalPages: number): number[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const middle = clampNumber(currentPage, 3, totalPages - 2);
  const pages = new Set([1, middle - 1, middle, middle + 1, totalPages]);
  return [...pages].sort((a, b) => a - b);
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}

async function copyText(text: string, successMessage = 'Copied to clipboard') {
  try {
    await copyToClipboard(text);
    toast.success(successMessage);
    return true;
  } catch (err) {
    toast.error(getErrorMessage(err, '澶嶅埗澶辫触锛岃鎵嬪姩澶嶅埗'));
    return false;
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return '鏆傛棤鏁版嵁';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '鏃堕棿鏃犳晥';

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(value: string): string {
  const [, month, day] = value.split('-');
  return month && day ? `${Number(month)}/${Number(day)}` : value;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  return typeof value === 'object' && value !== null;
}

function isJsonContentType(contentType: string): boolean {
  return contentType.includes('application/json') || contentType.includes('+json');
}

function isLikelyHtmlResponse(contentType: string, body: string): boolean {
  const normalizedBody = body.trim().slice(0, 200).toLowerCase();
  return contentType.includes('text/html')
    || normalizedBody.startsWith('<!doctype')
    || normalizedBody.startsWith('<html')
    || normalizedBody.includes('<head');
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
    return `${fallback}: received non-JSON response: ${summary}`;
  }

  return `${fallback}: received non-JSON response`;
}

function withNoCacheQuery(input: RequestInfo | URL, init?: RequestInit): RequestInfo | URL {
  const method = init?.method?.toUpperCase() ?? 'GET';
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

  return input;
}

async function getApiErrorMessage(response: Response, fallback: string): Promise<string> {
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

async function apiRequest<T>(input: RequestInfo | URL, init: RequestInit | undefined, fallback: string): Promise<T> {
  const response = await fetch(withNoCacheQuery(input, init), {
    ...init,
    cache: 'no-store',
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
    return await response.json() as T;
  } catch {
    throw new Error(`${fallback}锛氭帴鍙ｈ繑鍥炵殑 JSON 鏃犳硶瑙ｆ瀽`);
  }
}

// ============================================================
// API Functions
// ============================================================

async function fetchRandomImage(tag?: string): Promise<ImageRecord> {
  const params = new URLSearchParams();
  if (tag) params.set('tag', tag);
  params.set('format', 'json');
  const query = params.toString();
  return apiRequest<ImageRecord>(`/api/random${query ? `?${query}` : ''}`, undefined, 'Failed to fetch random image');
}

async function fetchImagesPage(params: {
  page: number;
  pageSize: number;
  search?: string;
  tag?: string | null;
}): Promise<PaginatedImages> {
  const query = new URLSearchParams();
  query.set('page', String(params.page));
  query.set('pageSize', String(params.pageSize));

  const search = params.search?.trim();
  if (search) query.set('search', search);
  if (params.tag) query.set('tag', params.tag);

  return apiRequest<PaginatedImages>(`/api/list?${query.toString()}`, undefined, 'Failed to fetch images');
}

async function fetchStats(): Promise<Stats> {
  return apiRequest<Stats>('/api/stats', undefined, 'Failed to fetch stats');
}

async function verifyAdminToken(adminToken: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>('/api/admin/verify', {
    headers: { Authorization: `Bearer ${adminToken}` },
  }, 'Failed to verify admin token');
}

function getAdminHeaders(adminToken: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminToken}`,
  };
}

async function createImage(data: { url: string; title: string; tags: string[] }, adminToken: string): Promise<ImageRecord> {
  return apiRequest<ImageRecord>('/api/create', {
    method: 'POST',
    headers: getAdminHeaders(adminToken),
    body: JSON.stringify(data),
  }, 'Failed to create image');
}

async function updateImage(id: string, data: { url?: string; title?: string; tags?: string[] }, adminToken: string): Promise<ImageRecord> {
  return apiRequest<ImageRecord>(`/api/update/${id}`, {
    method: 'PUT',
    headers: getAdminHeaders(adminToken),
    body: JSON.stringify(data),
  }, 'Failed to update image');
}

async function deleteImage(id: string, adminToken: string): Promise<void> {
  await apiRequest<{ success: boolean }>(`/api/delete/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  }, 'Failed to delete image');
}

async function batchCreateImages(images: Array<{ url: string; title: string; tags: string[] }>, adminToken: string): Promise<{
  total: number;
  success: number;
  failed: number;
  results: Array<{ success: boolean; url: string; id?: string; error?: string }>;
}> {
  return apiRequest('/api/batch', {
    method: 'POST',
    headers: getAdminHeaders(adminToken),
    body: JSON.stringify({ images }),
  }, 'Failed to batch create images');
}

function AmbientBackground() {
  return (
    <div className="fixed inset-0 ambient-gradient pointer-events-none" />
  );
}

// ============================================================
// Header
// ============================================================

function Header({ activeTab, onTabChange }: { activeTab: AppTab; onTabChange: (tab: AppTab) => void }) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex h-14 sm:h-16 items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onTabChange('random')}
            className="flex items-center gap-2 group text-left shrink-0 min-w-0 rounded-lg -ml-2 pl-2 pr-1 py-1 hover:bg-secondary/50 transition-colors"
            aria-label="杩斿洖闅忔満鍥剧墖椤甸潰"
          >
            <img
              src={APP_LOGO_URL}
              alt={`${APP_NAME} Logo`}
              width={32}
              height={32}
              className="w-8 h-8 rounded-lg transition-transform group-hover:scale-105"
            />
            <span className="truncate font-semibold text-base sm:text-lg tracking-tight">
              {APP_NAME}
            </span>
          </button>

          <nav className="hidden md:flex items-center gap-1">
            {HEADER_TABS.map(item => (
              <button
                key={item.key}
                type="button"
                onClick={() => onTabChange(item.key)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === item.key
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
                }`}
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <a
              href="https://paiii.cn"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 max-sm:px-1.5 max-sm:py-1.5 rounded-md hover:bg-secondary/80"
            >
              <span className="hidden sm:inline">PAIII Community</span>
              <ExternalLink className="w-3.5 h-3.5 sm:w-3 sm:h-3" aria-hidden />
            </a>
            <Button
              variant="ghost"
              size="icon"
              className="w-9 h-9 hover:bg-secondary/80 transition-colors md:hidden"
              onClick={() => onTabChange(activeTab === 'random' ? 'gallery' : 'random')}
              aria-label="鍒囨崲椤甸潰"
            >
              {activeTab === 'random' ? <Image className="w-4 h-4" /> : <Shuffle className="w-4 h-4" />}
            </Button>
          </div>
        </div>
        <nav className="grid grid-cols-3 gap-1 pb-2 md:hidden">
          {HEADER_TABS.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => onTabChange(item.key)}
              className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors ${
                activeTab === item.key
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
              }`}
            >
              <item.icon className="w-3.5 h-3.5" />
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

// ============================================================
// Hero Section
// ============================================================

// ============================================================
// Main App
// ============================================================

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('random');
  const appUrl = buildAppUrl('/');

  const handleTabChange = (tab: AppTab) => {
    setActiveTab(tab);
  };

  return (
    <div id="top" className="relative min-h-screen overflow-x-hidden page-bg">
      <AmbientBackground />
      <Header activeTab={activeTab} onTabChange={handleTabChange} />

      <main>
        {activeTab === 'random' && (
          <Suspense fallback={<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-24 sm:py-28"><div className="h-[420px] rounded-2xl skeleton-shimmer" /></div>}>
            <RandomPage />
          </Suspense>
        )}

        {activeTab === 'gallery' && (
          <Suspense fallback={<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-24 sm:py-28"><div className="h-[420px] rounded-2xl skeleton-shimmer" /></div>}>
            <GalleryPage />
          </Suspense>
        )}

        {activeTab === 'docs' && (
          <Suspense fallback={<div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-20"><div className="h-[360px] rounded-2xl skeleton-shimmer" /></div>}>
            <DocsPage />
          </Suspense>
        )}
      </main>

      <footer className="relative z-10 py-10 px-4 sm:px-6 border-t border-border/50 bg-secondary/10">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-5 text-center">
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              <div className="w-6 h-6 rounded-md flex items-center justify-center">
                <img
                  src={APP_LOGO_URL}
                  alt={`${APP_NAME} Logo`}
                  width={24}
                  height={24}
                  loading="lazy"
                  decoding="async"
                  className="w-6 h-6"
                />
              </div>
              <span className="font-semibold">{APP_NAME}</span>
              <span className="text-muted-foreground text-sm">
                漏 {new Date().getFullYear()} 娲剧珛鏂?
              </span>
            </div>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <p className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1">
                <span>Site powered by</span>
                <img
                  src={APP_LOGO_URL}
                  alt="PAIII Logo"
                  width={16}
                  height={16}
                  loading="lazy"
                  decoding="async"
                  className="h-4 w-4 inline-block mx-0.5"
                />
                <span>PAIII infrastructure and gallery support</span>
              </p>
              <p className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1">
                <span>CDN support from</span>
                <img
                  src={EDGEONE_LOGO_URL}
                  alt="EdgeOne Logo"
                  width={92}
                  height={16}
                  loading="lazy"
                  decoding="async"
                  className="h-4 w-auto inline-block mx-0.5"
                />
                <span>EdgeOne enterprise CDN</span>
              </p>
            </div>
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-center justify-center gap-y-3 sm:gap-x-8 text-sm text-muted-foreground max-w-full">
              <a
                href="#changelog"
                className="hover:text-foreground transition-colors sm:hidden"
              >
                Changelog
              </a>
              <a
                href="https://paiii.cn"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                PAIII Community
                <ExternalLink className="w-3 h-3 shrink-0" aria-hidden />
              </a>
              <a
                href={appUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                {APP_NAME}
                <ExternalLink className="w-3 h-3 shrink-0" aria-hidden />
              </a>
              <a
                href="https://beian.miit.gov.cn/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                铚€ICP澶?022012020鍙?4
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
