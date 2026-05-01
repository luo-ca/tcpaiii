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

function HeroSection({ onShuffle }: { onShuffle: () => void }) {
  const scrollToPreview = () => {
    document.getElementById('preview')?.scrollIntoView({ behavior: 'smooth' });
    onShuffle();
  };

  const scrollToDocs = () => {
    document.getElementById('api')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative z-10 pt-24 sm:pt-28 pb-14 sm:pb-16 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto text-center">
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass mb-6"
          style={{ animation: 'slide-up 0.6s ease-out forwards' }}
        >
          <Sparkles className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-medium">Free · Stable · Fast</span>
        </div>

        <h1
          className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-4"
          style={{ animation: 'slide-up 0.6s ease-out 0.1s both' }}
        >
          <span className="text-gradient">{APP_NAME}</span>
        </h1>

        <p
          className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 text-balance"
          style={{ animation: 'slide-up 0.6s ease-out 0.2s both' }}
        >
          鍏嶈垂闅忔満鍥剧墖 API 鏈嶅姟锛岀敱娲剧珛鏂圭ぞ鍖洪┍鍔?          <br className="hidden sm:block" />
          鏀寔澶栭摼鍥惧簥绠＄悊銆佸垎绫荤瓫閫夈€丣SON 杩斿洖涓?302 鐩撮摼璋冪敤
        </p>

        <div
          className="flex flex-wrap items-center justify-center gap-3"
          style={{ animation: 'slide-up 0.6s ease-out 0.3s both' }}
        >
          <Button
            size="lg"
            onClick={scrollToPreview}
            className="gradient-button rounded-full px-8 text-white border-0"
          >
            绔嬪嵆浣撻獙
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="rounded-full px-8 glass hover:bg-secondary/50 transition-all hover:border-primary/50"
            onClick={scrollToDocs}
          >
            API 鏂囨。
            <Code className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Online Preview (闅忔満鍥剧墖灞曠ず鍖?
// ============================================================

function OnlinePreview({ shuffleTrigger }: { shuffleTrigger: number }) {
  const [selectedTag, setSelectedTag] = useState<string | undefined>();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageTitle, setImageTitle] = useState<string>('');
  const [imageTags, setImageTags] = useState<string[]>([]);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();
  const prevTriggerRef = useRef(0);
  const initialLoadRef = useRef(false);
  const requestIdRef = useRef(0);
  const [imageKey, setImageKey] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const randomApiUrl = buildAppUrl(`/api/random${selectedTag ? `?tag=${encodeURIComponent(selectedTag)}` : ''}`);

  const { data: stats } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 15000,
    staleTime: 0,
  });

  const shuffleImage = useCallback(async (tag?: string) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setImageLoading(true);
    setPreviewError(null);
    try {
      const img = await fetchRandomImage(tag);
      if (requestId !== requestIdRef.current) return;
      setImageLoaded(false);
      setImageKey(key => key + 1);
      setImageUrl(img.url);
      setImageTitle(img.title);
      setImageTags(img.tags);
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      const message = getErrorMessage(err, '鑾峰彇闅忔満鍥剧墖澶辫触');
      setPreviewError(message);
      toast.error(message);
      setImageLoading(false);
    }
  }, [queryClient]);

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    shuffleImage();
  }, [shuffleImage]);

  useEffect(() => {
    if (shuffleTrigger > prevTriggerRef.current) {
      prevTriggerRef.current = shuffleTrigger;
      shuffleImage(selectedTag);
    }
  }, [shuffleTrigger, shuffleImage, selectedTag]);

  const handleImageLoad = () => {
    setImageLoading(false);
    setImageLoaded(true);
    setPreviewError(null);
  };

  const handleImageError = () => {
    const message = '鍥剧墖鍔犺浇澶辫触锛岃閲嶈瘯';
    setImageLoading(false);
    setImageLoaded(false);
    setPreviewError(message);
    toast.error(message);
  };

  const copyUrl = async () => {
    if (!imageUrl) return;
    const success = await copyText(imageUrl, 'Image URL copied');
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSelectTag = (tag?: string) => {
    setSelectedTag(tag);
    shuffleImage(tag);
  };

  const hasImage = imageUrl && imageLoaded && !previewError;

  return (
    <section id="preview" className="relative z-10 py-14 sm:py-16 px-4 sm:px-6 scroll-mt-20">
      <div className="max-w-4xl mx-auto">
        <div className="section-header animate-slide-up">
          <h2>鍦ㄧ嚎棰勮</h2>
          <p>閫夋嫨鍒嗙被骞跺埛鏂帮紝鍗虫椂鏌ョ湅闅忔満鍥剧墖鏁堟灉</p>
        </div>

        <div className="browser-window glass-strong rounded-2xl shadow-2xl shadow-black/5 hover-lift">
          {/* 娴忚鍣ㄥご閮?*/}
          <div className="browser-header">
            <div className="hidden sm:flex items-center gap-2">
              <div className="browser-dot browser-dot-red" />
              <div className="browser-dot browser-dot-yellow" />
              <div className="browser-dot browser-dot-green" />
            </div>
            <div className="min-w-0 flex-1 sm:ml-3">
              <div className="truncate rounded-md bg-secondary/50 px-3 py-1.5 text-xs text-muted-foreground border border-border/60 font-mono">
                {randomApiUrl}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 shrink-0 hover:bg-primary/10 transition-all"
              onClick={() => shuffleImage(selectedTag)}
              disabled={imageLoading}
              aria-label="鍒锋柊闅忔満鍥剧墖"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${imageLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* 鍥剧墖灞曠ず鍖?*/}
          <div className="relative bg-secondary/30 min-h-[300px] sm:min-h-[400px] aspect-[16/10] flex items-center justify-center overflow-hidden">
            {/* 楠ㄦ灦灞?*/}
            {imageLoading && (
              <div className="absolute inset-0 skeleton-shimmer z-20" />
            )}

            {/* 绌虹姸鎬?*/}
            {!imageUrl && !imageLoading && !previewError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/50">
                <Camera className="w-16 h-16 mb-3 opacity-30" />
                <p className="text-sm">鏆傛棤棰勮鍥剧墖</p>
              </div>
            )}

            {/* 閿欒鐘舵€?*/}
            {previewError && !imageLoading && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/75 p-6 text-center backdrop-blur-md">
                <Camera className="w-14 h-14 mb-3 text-muted-foreground/30" />
                <p className="text-sm font-medium text-foreground">棰勮鍔犺浇澶辫触</p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">{previewError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 rounded-full glass"
                  onClick={() => shuffleImage(selectedTag)}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  閲嶈瘯
                </Button>
              </div>
            )}

            {/* 鍥剧墖 */}
            {imageUrl && (
              <img
                key={imageKey}
                src={imageUrl}
                alt={imageTitle}
                className={`w-full h-full object-cover transition-all duration-500 ${
                  imageLoaded && !previewError ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                }`}
                onLoad={handleImageLoad}
                onError={handleImageError}
              />
            )}

            {/* 鎮诞淇℃伅鏍?*/}
            {hasImage && (
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 via-black/40 to-transparent z-10">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-white font-semibold text-base truncate mb-1">{imageTitle}</h3>
                    <div className="flex gap-1.5 flex-wrap">
                      {imageTags.map(tag => (
                        <span key={tag} className="text-xs bg-white/20 backdrop-blur-sm text-white/90 px-2 py-0.5 rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0 sm:ml-3 sm:flex-nowrap">
                    <Button size="sm" variant="secondary" className="h-7 min-w-0 text-xs bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white border-0" onClick={copyUrl}>
                      {copied ? <Check className="w-3 h-3 mr-1" /> : <CopyIcon className="w-3 h-3 mr-1" />}
                      澶嶅埗
                    </Button>
                    <Button size="sm" variant="secondary" className="h-7 w-7 p-0 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white border-0" asChild>
                      <a href={imageUrl} target="_blank" rel="noopener noreferrer">
                        <span className="sr-only">鎵撳紑鍥剧墖</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 搴曢儴鏍囩鏍?*/}
          <div className="p-4 border-t border-border/50 bg-secondary/20">
            <div className="category-strip flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory sm:flex-wrap sm:overflow-visible">
              <button
                type="button"
                className={`category-button shrink-0 snap-start px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  selectedTag === undefined
                    ? 'active bg-primary text-primary-foreground shadow-sm scale-105'
                    : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:scale-105'
                }`}
                onClick={() => handleSelectTag(undefined)}
              >
                鍏ㄩ儴
              </button>
              {stats?.tags?.map(tag => (
                <button
                  key={tag}
                  type="button"
                  className={`category-button shrink-0 snap-start px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    selectedTag === tag
                      ? 'active bg-primary text-primary-foreground shadow-sm scale-105'
                      : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:scale-105'
                  }`}
                  onClick={() => handleSelectTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Real-time Stats
// ============================================================

function RealtimeStats() {
  const { data: stats } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 10000,
  });

  const dailyEntries = useMemo(
    () => Object.entries(stats?.dailyRequests ?? {}).sort(([left], [right]) => left.localeCompare(right)),
    [stats?.dailyRequests]
  );
  const chartData = dailyEntries.map(([dateKey, count]) => ({
    date: formatShortDate(dateKey),
    fullDate: dateKey,
    requests: count,
  }));
  const totalRecentRequests = chartData.reduce((sum, item) => sum + item.requests, 0);
  const hasTrendData = chartData.some(item => item.requests > 0);
  const statCards = [
    { label: 'Total Requests', value: formatNumber(stats?.totalRequests ?? 0), icon: TrendingUp, color: 'text-blue-500', sub: 'All-time request count' },
    { label: '浠婃棩璋冪敤', value: formatNumber(stats?.todayRequests ?? 0), icon: Clock, color: 'text-indigo-500', sub: `${stats?.lastRequestAt ? new Date(stats.lastRequestAt).toLocaleDateString('zh-CN') : '鏆傛棤鏁版嵁'}` },
    { label: 'Connected Sites', value: formatNumber(stats?.totalSites ?? 0), icon: Globe, color: 'text-cyan-500', sub: 'Source domains tracked' },
    { label: 'Total Images', value: formatNumber(stats?.totalImages ?? 0), icon: Layers, color: 'text-fuchsia-500', sub: `${stats?.tags?.length ?? 0} tags` },
  ];

  return (
    <section id="stats" className="relative z-10 py-16 px-4 sm:px-6 scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <div className="section-header animate-slide-up">
          <h2>瀹炴椂缁熻</h2>
          <p>API activity and gallery resource overview</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {statCards.map((card, i) => (
            <Card key={i} className="glass-strong rounded-2xl hover-lift">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-secondary/60 flex items-center justify-center">
                    <card.icon className={`w-4 h-4 ${card.color}`} />
                  </div>
                  <span className="text-xs text-muted-foreground">{card.label}</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{card.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="glass-strong rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium">7-day trend</span>
              </div>
              <span className="rounded-full bg-secondary/60 px-3 py-1 text-xs text-muted-foreground">
                杩?7 澶?{formatNumber(totalRecentRequests)} 娆?              </span>
            </div>
            <div className="h-44">
              {hasTrendData ? (
                <ChartContainer
                  config={{
                    requests: {
                      label: 'Requests',
                      color: 'hsl(var(--primary))',
                    },
                  }}
                  className="h-full w-full"
                >
                  <AreaChart data={chartData} margin={{ left: 6, right: 8, top: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="requestsTrend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-requests)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--color-requests)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                    />
                    <YAxis
                      width={32}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent indicator="line" labelKey="fullDate" />}
                    />
                    <Area
                      type="monotone"
                      dataKey="requests"
                      stroke="var(--color-requests)"
                      strokeWidth={2.5}
                      fill="url(#requestsTrend)"
                      dot={{ r: 3, strokeWidth: 2 }}
                      activeDot={{ r: 5 }}
                    />
                  </AreaChart>
                </ChartContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground/40">
                  <div className="text-center">
                    <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">鏆傛棤璋冪敤鏁版嵁</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

// ============================================================
// Why Choose Section
// ============================================================

function WhyChoose() {
  const features = [
    { icon: Zap, title: 'Fast Response', desc: 'Edge delivery keeps image requests quick and stable.', color: 'from-blue-500 to-cyan-400' },
    { icon: Shield, title: '绋冲畾鍙潬', desc: 'URL 鏍￠獙銆佸幓閲嶆娴嬶紝鎺ュ彛杈撳嚭绋冲畾', color: 'from-emerald-500 to-teal-400' },
    { icon: Tag, title: 'Flexible Tags', desc: 'Images can be organized by tag for random and targeted access.', color: 'from-indigo-500 to-violet-500' },
    { icon: Heart, title: 'Open Usage', desc: 'Works well for frontend pages, Markdown embeds, and scripts.', color: 'from-fuchsia-500 to-pink-500' },
  ];

  return (
    <section id="features" className="relative z-10 py-16 px-4 sm:px-6 scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <div className="section-header animate-slide-up">
          <h2>涓轰粈涔堥€夋嫨闅忔満鍥剧墖 API</h2>
          <p>绠€鍗曘€佸揩閫熴€佸彲闈犵殑闅忔満鍥剧墖鎺ュ彛鏈嶅姟</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f, i) => (
            <Card key={i} className="glass rounded-2xl hover-lift border-border/50 ring-1 ring-transparent hover:ring-primary/10">
              <CardContent className="p-6">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center text-white mb-4 shadow-lg`}>
                  <f.icon className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-lg text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// API Docs Section
// ============================================================

function ApiDocsSection() {
  const [activeDocTab, setActiveDocTab] = useState('basic');
  const randomApiUrl = buildAppUrl('/api/random');
  const randomTagApiUrl = buildAppUrl('/api/random?tag=acg');
  const randomJsonApiUrl = buildAppUrl('/api/random?format=json');

  const copyCode = async (text: string) => {
    await copyText(text);
  };

  return (
    <section id="api" className="relative z-10 py-16 px-4 sm:px-6 scroll-mt-20">
      <div className="section-header animate-slide-up">
        <h2>API 鏂囨。</h2>
        <p>Just a few steps to integrate quickly</p>
      </div>

      <div className="max-w-4xl mx-auto">
        <Tabs value={activeDocTab} onValueChange={setActiveDocTab}>
          <TabsList className="grid w-full h-auto grid-cols-2 sm:grid-cols-4 gap-1 glass rounded-xl p-1 sm:p-1.5 min-h-[2.75rem] mb-6">
            <TabsTrigger value="basic" className="rounded-lg text-xs sm:text-sm px-2 py-2 sm:px-3">鍩虹璋冪敤</TabsTrigger>
            <TabsTrigger value="params" className="rounded-lg text-xs sm:text-sm px-2 py-2 sm:px-3">鍒嗙被鍙傛暟</TabsTrigger>
            <TabsTrigger value="json" className="rounded-lg text-xs sm:text-sm px-2 py-2 sm:px-3">JSON 杩斿洖</TabsTrigger>
            <TabsTrigger value="advanced" className="rounded-lg text-xs sm:text-sm px-2 py-2 sm:px-3">楂樼骇鐢ㄦ硶</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="mt-6 space-y-3">
            {/* API 鍦板潃 */}
            <Card className="glass-strong rounded-2xl">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Code className="w-5 h-5 text-blue-500" />
                  <span className="text-sm font-medium">鍩虹璋冪敤</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">榛樿杩斿洖 302 鍥剧墖鐩撮摼锛涢渶瑕?JSON 鍏冩暟鎹椂杩藉姞 format=json</p>

                <div className="space-y-2">
                  <div className="flex flex-col gap-3 p-3 bg-muted/40 rounded-lg sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground mb-1">API URL (default 302)</p>
                      <code className="block overflow-x-auto break-all text-sm text-foreground sm:whitespace-nowrap">{randomApiUrl}</code>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 shrink-0 justify-center card-button" onClick={() => copyCode(randomApiUrl)}>
                      <CopyIcon className="w-3.5 h-3.5" />
                      <span className="ml-1 text-xs">澶嶅埗</span>
                    </Button>
                  </div>
                  <div className="flex flex-col gap-3 p-3 bg-muted/40 rounded-lg sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground mb-1">HTML 浣跨敤绀轰緥</p>
                      <code className="block overflow-x-auto whitespace-nowrap text-xs text-foreground">{`<img src="${randomApiUrl}" alt="闅忔満鍥剧墖" />`}</code>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 shrink-0 justify-center card-button" onClick={() => copyCode(`<img src="${randomApiUrl}" alt="闅忔満鍥剧墖" />`)}>
                      <CopyIcon className="w-3.5 h-3.5" />
                      <span className="ml-1 text-xs">澶嶅埗</span>
                    </Button>
                  </div>
                  <div className="flex flex-col gap-3 p-3 bg-muted/40 rounded-lg sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground mb-1">Markdown 浣跨敤绀轰緥</p>
                      <code className="block overflow-x-auto whitespace-nowrap text-xs text-foreground">{`![闅忔満鍥剧墖](${randomApiUrl})`}</code>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 shrink-0 justify-center card-button" onClick={() => copyCode(`![闅忔満鍥剧墖](${randomApiUrl})`)}>
                      <CopyIcon className="w-3.5 h-3.5" />
                      <span className="ml-1 text-xs">澶嶅埗</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="params" className="mt-6">
            <Card className="glass-strong rounded-2xl">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="w-5 h-5 text-indigo-500" />
                  <span className="text-sm font-medium">鍒嗙被鍙傛暟</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">閫氳繃 tag 鍙傛暟鎸囧畾鍥剧墖鍒嗙被</p>
                <div className="space-y-2">
                  <div className="flex flex-col gap-3 p-3 bg-muted/40 rounded-lg sm:flex-row sm:items-center sm:justify-between">
                    <code className="overflow-x-auto whitespace-nowrap text-sm text-foreground">{randomTagApiUrl}</code>
                    <Button variant="ghost" size="sm" className="h-7 shrink-0 justify-center card-button" onClick={() => copyCode(randomTagApiUrl)}>
                      <CopyIcon className="w-3.5 h-3.5" />
                      <span className="ml-1 text-xs">澶嶅埗</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="json" className="mt-6">
            <Card className="glass-strong rounded-2xl">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Code className="w-5 h-5 text-cyan-500" />
                  <span className="text-sm font-medium">JSON 杩斿洖妯″紡</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">杩藉姞 format=json 杩斿洖 JSON 鏁版嵁锛屽寘鍚浘鐗?URL銆佹爣棰樸€佹爣绛剧瓑淇℃伅</p>
                <div className="flex flex-col gap-3 p-3 bg-muted/40 rounded-lg mb-3 sm:flex-row sm:items-center sm:justify-between">
                  <code className="overflow-x-auto whitespace-nowrap text-sm text-foreground">{randomJsonApiUrl}</code>
                  <Button variant="ghost" size="sm" className="h-7 shrink-0 justify-center card-button" onClick={() => copyCode(randomJsonApiUrl)}>
                    <CopyIcon className="w-3.5 h-3.5" />
                    <span className="ml-1 text-xs">澶嶅埗</span>
                  </Button>
                </div>
                <div className="p-3 bg-muted/40 rounded-lg">
                  <pre className="text-xs text-foreground overflow-x-auto">
{`{
  "id": "img-001",
  "url": "https://example.com/image.jpg",
  "title": "浜屾鍏冩彃鐢?,
  "tags": ["acg", "浜屾鍏?],
  "createdAt": "2025-01-15T08:00:00Z"
}`}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="advanced" className="mt-6">
            <Card className="glass-strong rounded-2xl">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-5 h-5 text-emerald-500" />
                  <span className="text-sm font-medium">楂樼骇鐢ㄦ硶</span>
                </div>
                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-muted/40 rounded-lg">
                    <p className="text-muted-foreground mb-1">JavaScript 璋冪敤</p>
                    <pre className="text-foreground overflow-x-auto">
{`fetch('/api/random?format=json')
  .then(r => r.json())
  .then(data => console.log(data.url))`}
                    </pre>
                  </div>
                  <div className="p-3 bg-muted/40 rounded-lg">
                    <p className="text-muted-foreground mb-1">CLI example</p>
                    <pre className="text-foreground overflow-x-auto">
{`curl ${randomApiUrl}`}
                    </pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}

// ============================================================
// Image Submission
// ============================================================

function ImageSubmission() {
  return (
    <section id="contribute" className="relative z-10 py-16 px-4 sm:px-6 scroll-mt-20">
      <div className="section-header animate-slide-up">
        <h2>鍥剧墖鎶曠</h2>
        <p>Contribute high-quality images and help grow the gallery.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
        <Card className="glass-strong rounded-2xl hover-lift">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-secondary/60 flex items-center justify-center">
                <Mail className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">QQ 鑱旂郴</h3>
                <p className="text-xs text-muted-foreground">娣诲姞 QQ 濂藉弸鎶曠鍥剧墖璧勬簮</p>
              </div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <code className="text-sm font-medium">2553256126</code>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-strong rounded-2xl hover-lift">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-secondary/60 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-indigo-500" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">绀惧尯鍙戝笘</h3>
                <p className="text-xs text-muted-foreground">鍦ㄦ淳绔嬫柟绀惧尯鍙戝笘鎶曠</p>
              </div>
            </div>
            <div className="text-center">
              <Button size="sm" className="gradient-button rounded-full border-0 text-white text-xs h-8" asChild>
                <a href="https://www.paiii.cn/bbs/9" target="_blank" rel="noreferrer">
                  鍓嶅線鎶曠
                  <ChevronRight className="w-3 h-3 ml-1" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

// ============================================================
// Changelog
// ============================================================

function Changelog() {
  const updates = [
    {
      date: '2026-04-29',
      title: 'Pages 鍖栦笌鍥惧簱鍗囩骇',
      items: [
        '鑴辩 PHP 鎺ュ彛锛屾敼涓?EdgeOne Pages Functions 涓?KV 鎻愪緵鍥剧墖鏈嶅姟',
        '鏂板鍥惧簱灞曠ず涓庣鐞嗚兘鍔涳紝鏀寔鍥剧墖鏍囩銆佹悳绱㈠拰鍦ㄧ嚎棰勮',
        '鍥惧簱鍒嗛〉鍔犲叆椤电爜銆侀椤垫湯椤点€佽烦杞〉鏁板拰姣忛〉鏁伴噺閫夋嫨',
        '浼樺寲鎺ュ彛缂撳瓨銆佸垎椤靛姞杞姐€佺浉閭婚〉棰勫彇鍜屽浘鐗囧姞杞芥€ц兘',
      ],
    },
    {
      date: '2025-06-15',
      title: '灞曠ず绔欎笌鏂囨。',
      items: [
        '棣栭〉鏂板銆屾洿鏂版棩蹇椼€嶅尯鍧楋紝瀵艰埅鏇存竻鏅扮偣璺宠浆',
        'Expanded API docs with category usage, list data details, and JSON response examples',
        '鏂板瀹炴椂缁熻鍔熻兘锛氱粺璁¤皟鐢ㄥ拰瀹炴椂缁熻瓒嬪娍',
        '浼樺寲璋冩暣浜嗗竷灞€鍜岀粏鑺傦紝鎻愬崌鎬ц兘',
      ],
    },
    {
      date: '2025-04-10',
      title: '鎺ュ彛绾﹀畾',
      items: [
        '鍒嗙被缁熶竴浣跨敤 api/random?tag=xx锛屽苟鍏煎鏃х増 type=xx 鍙傛暟',
        'JSON responses now include id, url, title, tags, createdAt, and rolling request stats',
      ],
    },
  ];

  return (
    <section id="changelog" className="relative z-10 py-16 px-4 sm:px-6 scroll-mt-20">
      <div className="section-header animate-slide-up">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full glass text-sm text-muted-foreground mb-4">
          <span className="text-xs text-muted-foreground">CHANGELOG</span>
        </div>
        <h2>鏇存柊鏃ュ織</h2>
        <p>灞曠ず绔欑偣涓庢帴鍙ｈ鏄庣殑璋冩暣璁板綍锛堟寔缁洿鏂帮級</p>
      </div>

      <div className="max-w-3xl mx-auto space-y-6">
        {updates.map((update, i) => (
          <div key={i} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 rounded-full bg-primary mt-1.5 ring-4 ring-background" />
              {i < updates.length - 1 && <div className="w-px h-full bg-border mt-2" />}
            </div>
            <Card className="glass rounded-2xl flex-1 hover-lift">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-blue-500 font-mono font-medium">{update.date}</span>
                  <span className="text-sm font-semibold">{update.title}</span>
                </div>
                <ul className="space-y-1.5">
                  {update.items.map((item, j) => (
                    <li key={j} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary mt-1.5 shrink-0 select-none">路</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </section>
  );
}

// ============================================================
// ============================================================
// Main App
// ============================================================

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('random');
  const [shuffleTrigger, setShuffleTrigger] = useState(0);
  const appUrl = buildAppUrl('/');

  const handleTabChange = (tab: AppTab) => {
    setActiveTab(tab);
    if (tab === 'random') setShuffleTrigger(0);
  };

  return (
    <div id="top" className="relative min-h-screen overflow-x-hidden page-bg">
      <AmbientBackground />
      <Header activeTab={activeTab} onTabChange={handleTabChange} />

      <main>
        {activeTab === 'random' && (
          <>
            <HeroSection onShuffle={() => setShuffleTrigger(t => t + 1)} />
            <OnlinePreview shuffleTrigger={shuffleTrigger} />
            <RealtimeStats />
            <WhyChoose />
            <ApiDocsSection />
            <ImageSubmission />
            <Changelog />
          </>
        )}

        {activeTab === 'gallery' && (
          <Suspense fallback={<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-24 sm:py-28"><div className="h-[420px] rounded-2xl skeleton-shimmer" /></div>}>
            <GalleryPage />
          </Suspense>
        )}

        {activeTab === 'docs' && (
          <section className="py-2">
            <ApiDocsSection />
            <div className="max-w-4xl mx-auto px-4 sm:px-6 mt-2">
              <div className="p-6 rounded-2xl glass-strong">
                <h3 className="font-semibold text-base mb-5 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-blue-500" />
                  瀹夊叏闃叉姢涓庢€ц兘浼樺寲
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { icon: Shield, title: 'URL 鏍￠獙', desc: '娣诲姞鍥剧墖鏃惰嚜鍔ㄦ牎楠?URL 鏍煎紡' },
                    { icon: Database, title: '鍘婚噸妫€娴?', desc: '鐩稿悓 URL 鑷姩鎷掔粷' },
                    { icon: Zap, title: '杈圭紭璁＄畻', desc: 'EdgeOne 杈圭紭鑺傜偣锛屽欢杩?<50ms' },
                    { icon: Globe, title: 'KV 瀛樺偍', desc: '鏁版嵁鎸佷箙鍖栧湪杈圭紭鑺傜偣' },
                    { icon: Code, title: 'CORS 鏀寔', desc: '鎵€鏈夋帴鍙ｆ敮鎸佽法鍩熻姹?' },
                    { icon: ExternalLink, title: '302 閲嶅畾鍚?', desc: '鏀寔 redirect 妯″紡鐩撮摼' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors">
                      <div className="w-8 h-8 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0 mt-0.5">
                        <item.icon className="w-4 h-4 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground/90">{item.title}</p>
                        <p className="text-xs text-muted-foreground/60 mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
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
                <span>PAIII 鎻愪緵鎶€鏈拰鍥惧簥鏀寔</span>
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
                <span>浼佷笟鐗堟彁渚?CDN 鏀寔</span>
              </p>
            </div>
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-center justify-center gap-y-3 sm:gap-x-8 text-sm text-muted-foreground max-w-full">
              <a
                href="#changelog"
                className="hover:text-foreground transition-colors sm:hidden"
              >
                鏇存柊鏃ュ織
              </a>
              <a
                href="https://paiii.cn"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                娲剧珛鏂圭ぞ鍖?
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
