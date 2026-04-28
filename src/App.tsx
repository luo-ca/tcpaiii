import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Camera,
  Shuffle,
  Plus,
  Trash2,
  Edit3,
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
  RefreshCw,
  Search,
  Copy as CopyIcon,
  KeyRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/utils';

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

const API_HTML_FALLBACK_MESSAGE = 'API 请求返回了页面 HTML，说明 /api 路由当前没有命中函数，请检查 ESA 路由是否已绑定到 t.paiii.cn/api/*。';

const HEADER_TABS: Array<{ key: AppTab; label: string; icon: typeof Shuffle }> = [
  { key: 'random', label: '随机', icon: Shuffle },
  { key: 'gallery', label: '图库', icon: Image },
  { key: 'docs', label: 'API 文档', icon: Code },
];

const APP_NAME = '派次元 API';
const APP_DOMAIN = 'https://t.paiii.cn';
const APP_LOGO_URL = 'https://static.paiii.cn/logo.svg';
const EDGEONE_LOGO_URL = 'https://edgeone.ai/_next/static/media/headLogo.daeb48ad.png';
const MAX_BATCH_IMAGE_COUNT = 500;
const GALLERY_PAGE_SIZE = 24;
const GALLERY_PAGE_SIZE_OPTIONS = [12, 24, 36, 60] as const;

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

async function copyText(text: string, successMessage = '已复制到剪贴板') {
  try {
    await copyToClipboard(text);
    toast.success(successMessage);
    return true;
  } catch (err) {
    toast.error(getErrorMessage(err, '复制失败，请手动复制'));
    return false;
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return '暂无数据';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间无效';

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
    return `${fallback}：接口返回了非 JSON 内容（${summary}）`;
  }

  return `${fallback}：接口返回了非 JSON 内容`;
}

function withNoCacheQuery(input: RequestInfo | URL, init?: RequestInit): RequestInfo | URL {
  const method = init?.method?.toUpperCase() ?? 'GET';
  if (method !== 'GET') return input;

  const cacheBustValue = String(Date.now());

  if (typeof input === 'string') {
    const url = new URL(input, window.location.origin);
    url.searchParams.set('_t', cacheBustValue);
    return url.pathname + url.search + url.hash;
  }

  if (input instanceof URL) {
    const nextUrl = new URL(input.toString());
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
    throw new Error(`${fallback}：接口返回的 JSON 无法解析`);
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
            aria-label="返回随机图片页面"
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
              <span className="hidden sm:inline">派立方社区</span>
              <ExternalLink className="w-3.5 h-3.5 sm:w-3 sm:h-3" aria-hidden />
            </a>
            <Button
              variant="ghost"
              size="icon"
              className="w-9 h-9 hover:bg-secondary/80 transition-colors md:hidden"
              onClick={() => onTabChange(activeTab === 'random' ? 'gallery' : 'random')}
              aria-label="切换页面"
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
          <span className="text-sm font-medium">免费 · 稳定 · 高速</span>
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
          免费随机图片 API 服务，由派立方社区驱动
          <br className="hidden sm:block" />
          支持外链图床管理、分类筛选、JSON 返回与 302 直链调用
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
            立即体验
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="rounded-full px-8 glass hover:bg-secondary/50 transition-all hover:border-primary/50"
            onClick={scrollToDocs}
          >
            API 文档
            <Code className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Online Preview (随机图片展示区)
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
      const message = getErrorMessage(err, '获取随机图片失败');
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
    const message = '图片加载失败，请重试';
    setImageLoading(false);
    setImageLoaded(false);
    setPreviewError(message);
    toast.error(message);
  };

  const copyUrl = async () => {
    if (!imageUrl) return;
    const success = await copyText(imageUrl, '图片地址已复制');
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
          <h2>在线预览</h2>
          <p>选择分类并刷新，即时查看随机图片效果</p>
        </div>

        <div className="browser-window glass-strong rounded-2xl shadow-2xl shadow-black/5 hover-lift">
          {/* 浏览器头部 */}
          <div className="browser-header">
            <div className="hidden sm:flex items-center gap-2">
              <div className="browser-dot browser-dot-red" />
              <div className="browser-dot browser-dot-yellow" />
              <div className="browser-dot browser-dot-green" />
            </div>
            <div className="min-w-0 flex-1 sm:ml-3">
              <div className="truncate rounded-md bg-secondary/50 px-3 py-1.5 text-xs text-muted-foreground border border-border/60 font-mono">
                {APP_DOMAIN}/api/random{selectedTag ? `?tag=${selectedTag}` : ''}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 shrink-0 hover:bg-primary/10 transition-all"
              onClick={() => shuffleImage(selectedTag)}
              disabled={imageLoading}
              aria-label="刷新随机图片"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${imageLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* 图片展示区 */}
          <div className="relative bg-secondary/30 min-h-[300px] sm:min-h-[400px] aspect-[16/10] flex items-center justify-center overflow-hidden">
            {/* 骨架屏 */}
            {imageLoading && (
              <div className="absolute inset-0 skeleton-shimmer z-20" />
            )}

            {/* 空状态 */}
            {!imageUrl && !imageLoading && !previewError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/50">
                <Camera className="w-16 h-16 mb-3 opacity-30" />
                <p className="text-sm">暂无预览图片</p>
              </div>
            )}

            {/* 错误状态 */}
            {previewError && !imageLoading && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/75 p-6 text-center backdrop-blur-md">
                <Camera className="w-14 h-14 mb-3 text-muted-foreground/30" />
                <p className="text-sm font-medium text-foreground">预览加载失败</p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">{previewError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 rounded-full glass"
                  onClick={() => shuffleImage(selectedTag)}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  重试
                </Button>
              </div>
            )}

            {/* 图片 */}
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

            {/* 悬浮信息栏 */}
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
                  <div className="flex gap-2 shrink-0 sm:ml-3">
                    <Button size="sm" variant="secondary" className="h-7 text-xs bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white border-0" onClick={copyUrl}>
                      {copied ? <Check className="w-3 h-3 mr-1" /> : <CopyIcon className="w-3 h-3 mr-1" />}
                      复制
                    </Button>
                    <Button size="sm" variant="secondary" className="h-7 w-7 p-0 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white border-0" asChild>
                      <a href={imageUrl} target="_blank" rel="noopener noreferrer">
                        <span className="sr-only">打开图片</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 底部标签栏 */}
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
                全部
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
    { label: '总调用量', value: formatNumber(stats?.totalRequests ?? 0), icon: TrendingUp, color: 'text-blue-500', sub: '累计请求总次数' },
    { label: '今日调用', value: formatNumber(stats?.todayRequests ?? 0), icon: Clock, color: 'text-indigo-500', sub: `${stats?.lastRequestAt ? new Date(stats.lastRequestAt).toLocaleDateString('zh-CN') : '暂无数据'}` },
    { label: '接入站点', value: formatNumber(1), icon: Globe, color: 'text-cyan-500', sub: '使用本 API 的网站' },
    { label: '图片总数', value: formatNumber(stats?.totalImages ?? 0), icon: Layers, color: 'text-fuchsia-500', sub: `${stats?.tags?.length ?? 0} 个分类` },
  ];

  return (
    <section id="stats" className="relative z-10 py-16 px-4 sm:px-6 scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <div className="section-header animate-slide-up">
          <h2>实时统计</h2>
          <p>API 调用数据与图库资源概览</p>
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
                <span className="text-sm font-medium">7 天调用趋势</span>
              </div>
              <span className="rounded-full bg-secondary/60 px-3 py-1 text-xs text-muted-foreground">
                近 7 天 {formatNumber(totalRecentRequests)} 次
              </span>
            </div>
            <div className="h-44">
              {hasTrendData ? (
                <ChartContainer
                  config={{
                    requests: {
                      label: '调用量',
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
                    <p className="text-xs">暂无调用数据</p>
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
    { icon: Zap, title: '极速响应', desc: '边缘节点加速，毫秒级响应，图片秒开', color: 'from-blue-500 to-cyan-400' },
    { icon: Shield, title: '稳定可靠', desc: 'URL 校验、去重检测，接口输出稳定', color: 'from-emerald-500 to-teal-400' },
    { icon: Tag, title: '丰富分类', desc: '按标签组织图片，支持随机和定向调用', color: 'from-indigo-500 to-violet-500' },
    { icon: Heart, title: '开放使用', desc: '无需复杂配置，前端、Markdown、脚本均可接入', color: 'from-fuchsia-500 to-pink-500' },
  ];

  return (
    <section id="features" className="relative z-10 py-16 px-4 sm:px-6 scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <div className="section-header animate-slide-up">
          <h2>为什么选择随机图片 API</h2>
          <p>简单、快速、可靠的随机图片接口服务</p>
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

  const copyCode = async (text: string) => {
    await copyText(text);
  };

  return (
    <section id="api" className="relative z-10 py-16 px-4 sm:px-6 scroll-mt-20">
      <div className="section-header animate-slide-up">
        <h2>API 文档</h2>
        <p>简单几步，快速接入</p>
      </div>

      <div className="max-w-4xl mx-auto">
        <Tabs value={activeDocTab} onValueChange={setActiveDocTab}>
          <TabsList className="grid w-full h-auto grid-cols-2 sm:grid-cols-4 gap-0.5 sm:gap-1 glass rounded-xl p-1 sm:p-1.5 min-h-[2.75rem] mb-6">
            <TabsTrigger value="basic" className="rounded-lg text-xs sm:text-sm px-2 py-2 sm:px-3">基础调用</TabsTrigger>
            <TabsTrigger value="params" className="rounded-lg text-xs sm:text-sm px-2 py-2 sm:px-3">分类参数</TabsTrigger>
            <TabsTrigger value="json" className="rounded-lg text-xs sm:text-sm px-2 py-2 sm:px-3">JSON 返回</TabsTrigger>
            <TabsTrigger value="advanced" className="rounded-lg text-xs sm:text-sm px-2 py-2 sm:px-3">高级用法</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="mt-6 space-y-3">
            {/* API 地址 */}
            <Card className="glass-strong rounded-2xl">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Code className="w-5 h-5 text-blue-500" />
                  <span className="text-sm font-medium">基础调用</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">默认返回 302 图片直链；需要 JSON 元数据时追加 format=json</p>

                <div className="space-y-2">
                  <div className="flex flex-col gap-3 p-3 bg-muted/40 rounded-lg sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground mb-1">API 地址（默认 302）</p>
                      <code className="block overflow-x-auto whitespace-nowrap text-sm text-foreground">{APP_DOMAIN}/api/random</code>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 shrink-0 justify-center card-button" onClick={() => copyCode(`${APP_DOMAIN}/api/random`)}>
                      <CopyIcon className="w-3.5 h-3.5" />
                      <span className="ml-1 text-xs">复制</span>
                    </Button>
                  </div>
                  <div className="flex flex-col gap-3 p-3 bg-muted/40 rounded-lg sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground mb-1">HTML 使用示例</p>
                      <code className="block overflow-x-auto whitespace-nowrap text-xs text-foreground">{`<img src="${APP_DOMAIN}/api/random" alt="随机图片" />`}</code>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 shrink-0 justify-center card-button" onClick={() => copyCode(`<img src="${APP_DOMAIN}/api/random" alt="随机图片" />`)}>
                      <CopyIcon className="w-3.5 h-3.5" />
                      <span className="ml-1 text-xs">复制</span>
                    </Button>
                  </div>
                  <div className="flex flex-col gap-3 p-3 bg-muted/40 rounded-lg sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground mb-1">Markdown 使用示例</p>
                      <code className="block overflow-x-auto whitespace-nowrap text-xs text-foreground">{`![随机图片](${APP_DOMAIN}/api/random)`}</code>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 shrink-0 justify-center card-button" onClick={() => copyCode(`![随机图片](${APP_DOMAIN}/api/random)`)}>
                      <CopyIcon className="w-3.5 h-3.5" />
                      <span className="ml-1 text-xs">复制</span>
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
                  <span className="text-sm font-medium">分类参数</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">通过 tag 参数指定图片分类</p>
                <div className="space-y-2">
                  <div className="flex flex-col gap-3 p-3 bg-muted/40 rounded-lg sm:flex-row sm:items-center sm:justify-between">
                    <code className="overflow-x-auto whitespace-nowrap text-sm text-foreground">{APP_DOMAIN}/api/random?tag=acg</code>
                    <Button variant="ghost" size="sm" className="h-7 shrink-0 justify-center card-button" onClick={() => copyCode(`${APP_DOMAIN}/api/random?tag=acg`)}>
                      <CopyIcon className="w-3.5 h-3.5" />
                      <span className="ml-1 text-xs">复制</span>
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
                  <span className="text-sm font-medium">JSON 返回模式</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">追加 format=json 返回 JSON 数据，包含图片 URL、标题、标签等信息</p>
                <div className="flex flex-col gap-3 p-3 bg-muted/40 rounded-lg mb-3 sm:flex-row sm:items-center sm:justify-between">
                  <code className="overflow-x-auto whitespace-nowrap text-sm text-foreground">{APP_DOMAIN}/api/random?format=json</code>
                  <Button variant="ghost" size="sm" className="h-7 shrink-0 justify-center card-button" onClick={() => copyCode(`${APP_DOMAIN}/api/random?format=json`)}>
                    <CopyIcon className="w-3.5 h-3.5" />
                    <span className="ml-1 text-xs">复制</span>
                  </Button>
                </div>
                <div className="p-3 bg-muted/40 rounded-lg">
                  <pre className="text-xs text-foreground overflow-x-auto">
{`{
  "id": "img-001",
  "url": "https://example.com/image.jpg",
  "title": "二次元插画",
  "tags": ["acg", "二次元"],
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
                  <span className="text-sm font-medium">高级用法</span>
                </div>
                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-muted/40 rounded-lg">
                    <p className="text-muted-foreground mb-1">JavaScript 调用</p>
                    <pre className="text-foreground overflow-x-auto">
{`fetch('/api/random?format=json')
  .then(r => r.json())
  .then(data => console.log(data.url))`}
                    </pre>
                  </div>
                  <div className="p-3 bg-muted/40 rounded-lg">
                    <p className="text-muted-foreground mb-1">命令行调用</p>
                    <pre className="text-foreground overflow-x-auto">
{`curl ${APP_DOMAIN}/api/random`}
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
        <h2>图片投稿</h2>
        <p>欢迎投稿高质量图片，共建优质图片库</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
        <Card className="glass-strong rounded-2xl hover-lift">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-secondary/60 flex items-center justify-center">
                <Mail className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">QQ 联系</h3>
                <p className="text-xs text-muted-foreground">添加 QQ 好友投稿图片资源</p>
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
                <h3 className="font-semibold text-sm">社区发帖</h3>
                <p className="text-xs text-muted-foreground">在派立方社区发帖投稿</p>
              </div>
            </div>
            <div className="text-center">
              <Button size="sm" className="gradient-button rounded-full border-0 text-white text-xs h-8" asChild>
                <a href="https://www.paiii.cn/bbs/9" target="_blank" rel="noreferrer">
                  前往投稿
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
      title: 'Pages 化与图库升级',
      items: [
        '脱离 PHP 接口，改为 ESA Functions & Pages 与 EdgeKV 提供图片服务',
        '新增图库展示与管理能力，支持图片标签、搜索和在线预览',
        '图库分页加入页码、首页末页、跳转页数和每页数量选择',
        '优化接口缓存、分页加载、相邻页预取和图片加载性能',
      ],
    },
    {
      date: '2025-06-15',
      title: '展示站与文档',
      items: [
        '首页新增「更新日志」区块，导航更清晰点跳转',
        'API 文档扩充：分类与 data 列表说明、JSON 返回（含示例）',
        '新增实时统计功能：统计调用和实时统计趋势',
        '优化调整了布局和细节，提升性能',
      ],
    },
    {
      date: '2025-04-10',
      title: '接口约定',
      items: [
        '分类统一使用 api/random?tag=xx，并兼容旧版 type=xx 参数',
        'JSON 返回图片 id、url、title、tags、createdAt，统计接口新增最近 7 天调用数据',
      ],
    },
  ];

  return (
    <section id="changelog" className="relative z-10 py-16 px-4 sm:px-6 scroll-mt-20">
      <div className="section-header animate-slide-up">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full glass text-sm text-muted-foreground mb-4">
          <span className="text-xs text-muted-foreground">CHANGELOG</span>
        </div>
        <h2>更新日志</h2>
        <p>展示站点与接口说明的调整记录（持续更新）</p>
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
                      <span className="text-primary mt-1.5 shrink-0 select-none">·</span>
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
// Gallery Page
// ============================================================

function GalleryPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(GALLERY_PAGE_SIZE);
  const [pageJumpInput, setPageJumpInput] = useState('1');
  const [adminToken, setAdminToken] = useState('');
  const [adminAuthStatus, setAdminAuthStatus] = useState<AdminAuthStatus>('empty');
  const hasAdminToken = adminToken.trim().length > 0;
  const hasVerifiedAdminToken = hasAdminToken && adminAuthStatus === 'valid';

  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);
  const searchQuery = debouncedSearchTerm.trim();
  const imagesQuery = useQuery<PaginatedImages>({
    queryKey: ['images', { page, pageSize, search: searchQuery, tag: selectedTag }],
    queryFn: () => fetchImagesPage({
      page,
      pageSize,
      search: searchQuery,
      tag: selectedTag,
    }),
    placeholderData: previousData => previousData,
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 15000,
    staleTime: 0,
  });

  const images = imagesQuery.data?.items ?? [];
  const totalImages = stats?.totalImages ?? imagesQuery.data?.total ?? 0;
  const totalPages = imagesQuery.data?.totalPages ?? 1;
  const filteredTotal = imagesQuery.data?.total ?? 0;
  const tags = stats?.tags ?? [];
  const totalTags = tags.length;
  const visiblePages = useMemo(() => getVisiblePages(page, totalPages), [page, totalPages]);
  const latestImage = images.reduce<ImageRecord | null>((latest, img) => {
    if (!latest) return img;
    return new Date(img.createdAt).getTime() > new Date(latest.createdAt).getTime() ? img : latest;
  }, null);
  const isInitialLoading = imagesQuery.isLoading && !imagesQuery.data;

  const refreshGallery = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['images'] });
    queryClient.invalidateQueries({ queryKey: ['stats'], refetchType: 'all' });
  }, [queryClient]);

  const prefetchGalleryPage = useCallback((nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages) return;
    queryClient.prefetchQuery({
      queryKey: ['images', { page: nextPage, pageSize, search: searchQuery, tag: selectedTag }],
      queryFn: () => fetchImagesPage({
        page: nextPage,
        pageSize,
        search: searchQuery,
        tag: selectedTag,
      }),
      staleTime: 10000,
    });
  }, [pageSize, queryClient, searchQuery, selectedTag, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [pageSize, searchQuery, selectedTag]);

  useEffect(() => {
    if (imagesQuery.data && page > imagesQuery.data.totalPages) {
      setPage(imagesQuery.data.totalPages);
    }
  }, [imagesQuery.data, page]);

  useEffect(() => {
    setPageJumpInput(String(page));
  }, [page]);

  useEffect(() => {
    if (imagesQuery.data?.page && imagesQuery.data.page !== page) {
      setPage(imagesQuery.data.page);
    }
  }, [imagesQuery.data?.page, page]);

  useEffect(() => {
    if (!imagesQuery.data) return;
    prefetchGalleryPage(page + 1);
    prefetchGalleryPage(page - 1);
  }, [imagesQuery.data, page, prefetchGalleryPage]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteImage(id, adminToken.trim()),
    onSuccess: () => {
      toast.success('图片已删除');
      refreshGallery();
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, '删除失败'));
    },
  });

  const handleCopyUrl = async (url: string) => {
    await copyText(url, '图片地址已复制');
  };

  const goToPage = useCallback((nextPage: number) => {
    setPage(clampNumber(nextPage, 1, totalPages));
  }, [totalPages]);

  const handlePageJump = (event: React.FormEvent) => {
    event.preventDefault();
    const nextPage = Number.parseInt(pageJumpInput, 10);
    if (!Number.isFinite(nextPage)) {
      setPageJumpInput(String(page));
      return;
    }

    goToPage(nextPage);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedTag(null);
    setPage(1);
  };

  const handleAdminTokenChange = (value: string) => {
    setAdminToken(value);
    setAdminAuthStatus(value.trim() ? 'unverified' : 'empty');
  };

  const clearAdminToken = () => {
    setAdminToken('');
    setAdminAuthStatus('empty');
    toast.success('管理密钥已清除');
  };

  const checkAdminToken = useCallback(async (): Promise<boolean> => {
    const token = adminToken.trim();
    if (!token) {
      setAdminAuthStatus('empty');
      toast.error('请先填写管理密钥');
      return false;
    }

    setAdminAuthStatus('checking');
    try {
      await verifyAdminToken(token);
      setAdminAuthStatus('valid');
      toast.success('管理密钥校验通过');
      return true;
    } catch (err) {
      const message = getErrorMessage(err, '管理密钥校验失败');
      if (message.includes('not configured')) {
        setAdminAuthStatus('unconfigured');
        toast.error('服务端未配置管理密钥，请先在 ESA 环境变量配置 ADMIN_TOKEN');
      } else {
        setAdminAuthStatus('invalid');
        toast.error(message);
      }
      return false;
    }
  }, [adminToken]);

  const requireAdminToken = useCallback(async (): Promise<boolean> => {
    if (hasVerifiedAdminToken) return true;
    if (!hasAdminToken) {
      toast.error('请先填写管理密钥');
      return false;
    }

    return checkAdminToken();
  }, [checkAdminToken, hasAdminToken, hasVerifiedAdminToken]);

  const adminStatusText = {
    empty: '只读模式',
    unverified: '待校验',
    checking: '校验中',
    valid: '已验证',
    invalid: '密钥错误',
    unconfigured: '服务端未配置',
  }[adminAuthStatus];

  if (isInitialLoading) {
    return (
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-24 sm:py-28">
        <div className="mb-8 flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-32 rounded-lg skeleton-shimmer" />
            <div className="h-4 w-48 rounded-lg skeleton-shimmer" />
          </div>
          <div className="h-10 w-28 rounded-lg skeleton-shimmer" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-video rounded-xl skeleton-shimmer" />
          ))}
        </div>
      </div>
    );
  }

  if (imagesQuery.isError) {
    return (
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-28 text-center">
        <div className="max-w-md mx-auto rounded-2xl border border-red-100 glass-strong p-8">
          <Camera className="w-14 h-14 mx-auto mb-4 text-red-300" />
          <p className="text-lg font-medium text-foreground">图库加载失败</p>
          <p className="text-sm mt-2 text-muted-foreground">{getErrorMessage(imagesQuery.error, '请稍后重试')}</p>
          <Button className="mt-5" variant="outline" onClick={() => imagesQuery.refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            重新加载
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-24 sm:py-28">
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">图片管理</h2>
          <p className="text-muted-foreground text-sm mt-1">管理你的外链图片库</p>
        </div>
        <AddImageDialog adminToken={adminToken.trim()} onSuccess={refreshGallery} onRequireToken={requireAdminToken} />
      </div>

      <Card className="glass-strong rounded-2xl mb-5">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="admin-token" className="flex items-center gap-2 text-sm font-medium">
                <KeyRound className="h-4 w-4 text-blue-500" />
                管理密钥
              </Label>
              <Input
                id="admin-token"
                type="password"
                value={adminToken}
                onChange={event => handleAdminTokenChange(event.target.value)}
                placeholder="输入管理密钥后才能添加、编辑、删除"
                className="bg-secondary/30"
                autoComplete="off"
              />
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={hasVerifiedAdminToken ? 'default' : 'outline'}
                className={hasVerifiedAdminToken ? 'bg-emerald-600 text-white border-0' : 'text-muted-foreground'}
              >
                {adminStatusText}
              </Badge>
              {hasAdminToken && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void checkAdminToken()}
                  disabled={adminAuthStatus === 'checking'}
                >
                  {adminAuthStatus === 'checking' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <KeyRound className="mr-1.5 h-3.5 w-3.5" />}
                  校验
                </Button>
              )}
              {hasAdminToken && (
                <Button variant="outline" size="sm" onClick={clearAdminToken}>
                  清除
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 mb-5 sm:grid-cols-3">
        {[
          { label: '图片总数', value: totalImages, icon: Image },
          { label: '标签数量', value: totalTags, icon: Tag },
          { label: '当前页最新', value: latestImage ? formatDateTime(latestImage.createdAt) : '暂无数据', icon: Clock },
        ].map(item => (
          <Card key={item.label} className="glass-strong rounded-2xl">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0">
                <item.icon className="w-4 h-4 text-blue-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="truncate text-lg font-semibold text-foreground">{item.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="glass-strong rounded-2xl mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                placeholder="搜索标题、URL 或标签"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={selectedTag === null ? 'default' : 'outline'}
                className={`cursor-pointer ${
                  selectedTag === null ? 'bg-primary text-primary-foreground border-0' : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
                onClick={() => {
                  setSelectedTag(null);
                  setPage(1);
                }}
              >
                全部
              </Badge>
              {tags.map(tag => (
                <Badge
                  key={tag}
                  variant={selectedTag === tag ? 'default' : 'outline'}
                  className={`cursor-pointer ${
                    selectedTag === tag ? 'bg-primary text-primary-foreground border-0' : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground'
                  }`}
                  onClick={() => {
                    setSelectedTag(tag);
                    setPage(1);
                  }}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {totalImages === 0 && (
        <div className="rounded-2xl border border-dashed border-border glass px-6 py-16 text-center text-muted-foreground">
          <Camera className="w-14 h-14 mx-auto mb-4 opacity-25" />
          <p className="text-lg font-medium text-foreground">暂无图片</p>
          <p className="text-sm mt-1">添加第一张外链图片后即可开始提供随机图接口</p>
          <div className="mt-5 flex justify-center">
            <AddImageDialog adminToken={adminToken.trim()} onSuccess={refreshGallery} onRequireToken={requireAdminToken} />
          </div>
        </div>
      )}

      {totalImages > 0 && filteredTotal === 0 && (
        <div className="rounded-2xl border border-dashed border-border glass px-6 py-14 text-center">
          <Search className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-base font-medium text-foreground">没有匹配的图片</p>
          <p className="text-sm mt-1 text-muted-foreground">调整搜索词或标签筛选后再试</p>
          <Button variant="outline" className="mt-5" onClick={clearFilters}>清空筛选</Button>
        </div>
      )}

      {imagesQuery.isFetching && images.length > 0 && (
        <div className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/55 px-4 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载当前页
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {images.map((img, index) => (
          <Card
            key={img.id}
            className="group overflow-hidden glass rounded-2xl animate-fade-in hover-lift"
            style={{ animationDelay: `${Math.min(index, 12) * 0.035}s` }}
          >
            <CardContent className="p-0">
              <div className="relative aspect-video overflow-hidden bg-muted">
                <img
                  src={img.url}
                  alt={img.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  loading={index < 6 ? 'eager' : 'lazy'}
                  decoding="async"
                />
                <div className="absolute inset-0 bg-black/50 sm:bg-black/0 sm:group-hover:bg-black/60 transition-colors duration-300" />
                <div className="absolute inset-0 flex items-end p-3 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300 translate-y-0 sm:translate-y-2 sm:group-hover:translate-y-0">
                  <div className="w-full">
                    <div className="flex items-end justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-white font-medium text-sm truncate">{img.title}</h4>
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {img.tags.map(tag => (
                            <span key={tag} className="text-xs bg-white/15 backdrop-blur-sm text-white/80 px-1.5 py-0.5 rounded-full">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="secondary"
                          size="icon"
                          className="w-7 h-7 bg-white/15 hover:bg-white/25 text-white border-0 backdrop-blur-sm"
                          onClick={(e) => { e.stopPropagation(); handleCopyUrl(img.url); }}
                          aria-label="复制图片地址"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <EditImageDialog image={img} adminToken={adminToken.trim()} onSuccess={refreshGallery} onRequireToken={requireAdminToken} />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="destructive"
                              size="icon"
                              className="w-7 h-7 bg-red-500/30 hover:bg-red-500/50 text-white border-0 backdrop-blur-sm"
                              aria-label="删除图片"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>确认删除</AlertDialogTitle>
                              <AlertDialogDescription>确定要删除「{img.title}」吗？此操作不可撤销。</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={async () => {
                                  if (await requireAdminToken()) deleteMutation.mutate(img.id);
                                }}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                删除
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredTotal > 0 && (
        <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-border/60 bg-background/55 px-4 py-3 text-sm text-muted-foreground lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>共 {filteredTotal} 张</span>
            <span>每页 {imagesQuery.data?.pageSize ?? pageSize} 张</span>
            <span>第 {page} / {totalPages} 页</span>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || imagesQuery.isFetching}
                onClick={() => goToPage(1)}
                aria-label="跳转到第一页"
              >
                首页
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                disabled={page <= 1 || imagesQuery.isFetching}
                onClick={() => goToPage(page - 1)}
                aria-label="上一页"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {visiblePages.map((pageNumber, index) => {
                const previousPage = visiblePages[index - 1];
                const hasGap = previousPage !== undefined && pageNumber - previousPage > 1;

                return (
                  <div key={pageNumber} className="flex items-center gap-1">
                    {hasGap && <span className="flex h-9 w-6 items-center justify-center text-muted-foreground/70">…</span>}
                    <Button
                      variant={pageNumber === page ? 'default' : 'outline'}
                      size="icon"
                      className="h-9 w-9"
                      disabled={imagesQuery.isFetching}
                      onClick={() => goToPage(pageNumber)}
                      aria-current={pageNumber === page ? 'page' : undefined}
                      aria-label={`第 ${pageNumber} 页`}
                    >
                      {pageNumber}
                    </Button>
                  </div>
                );
              })}
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                disabled={page >= totalPages || imagesQuery.isFetching}
                onClick={() => goToPage(page + 1)}
                aria-label="下一页"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || imagesQuery.isFetching}
                onClick={() => goToPage(totalPages)}
                aria-label="跳转到最后一页"
              >
                末页
              </Button>
            </div>
            <form onSubmit={handlePageJump} className="flex items-center gap-2">
              <Label htmlFor="gallery-page-jump" className="text-xs text-muted-foreground">
                跳至
              </Label>
              <Input
                id="gallery-page-jump"
                type="number"
                min={1}
                max={totalPages}
                value={pageJumpInput}
                onChange={event => setPageJumpInput(event.target.value)}
                className="h-9 w-20 bg-background/60 text-center"
                disabled={imagesQuery.isFetching}
              />
              <Button type="submit" variant="outline" size="sm" disabled={imagesQuery.isFetching}>
                跳转
              </Button>
            </form>
            <div className="flex items-center gap-2">
              <Label htmlFor="gallery-page-size" className="text-xs text-muted-foreground">
                每页
              </Label>
              <Select value={String(pageSize)} onValueChange={value => setPageSize(Number(value))}>
                <SelectTrigger id="gallery-page-size" className="h-9 w-24 bg-background/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GALLERY_PAGE_SIZE_OPTIONS.map(option => (
                    <SelectItem key={option} value={String(option)}>
                      {option} 张
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Add Image Dialog (支持批量添加)
// ============================================================

function AddImageDialog({
  adminToken,
  onSuccess,
  onRequireToken,
}: {
  adminToken: string;
  onSuccess: () => void;
  onRequireToken: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [batchUrls, setBatchUrls] = useState('');
  const [batchTags, setBatchTags] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    if (open) {
      setMode('single');
      setUrl(''); setTitle(''); setTagsInput('');
      setBatchUrls(''); setBatchTags('');
      setProgress({ current: 0, total: 0 });
    }
  }, [open]);

  // 单张添加
  const singleMutation = useMutation({
    mutationFn: () => createImage({ url: url.trim(), title: title.trim() || '未命名图片', tags: parseTagsInput(tagsInput) }, adminToken),
    onSuccess: () => { toast.success('图片添加成功'); setOpen(false); onSuccess(); },
    onError: (err) => { toast.error(getErrorMessage(err, '添加失败')); },
  });

  // 批量添加（使用批量 API，一次请求完成）
  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(await onRequireToken())) return;

    const lines = [...new Set(batchUrls.split('\n').map(l => l.trim()).filter(Boolean))];
    if (lines.length === 0) { toast.error('请输入至少一个图片地址'); return; }
    if (lines.length > MAX_BATCH_IMAGE_COUNT) { toast.error(`单次最多添加 ${MAX_BATCH_IMAGE_COUNT} 张图片`); return; }

    const tags = parseTagsInput(batchTags);
    setProgress({ current: 0, total: lines.length });
    setLoading(true);

    try {
      // 使用批量 API，一次请求完成
      const result = await batchCreateImages(
        lines.map((imageUrl, i) => ({ url: imageUrl, title: `图片 ${i + 1}`, tags })),
        adminToken
      );
      setProgress({ current: result.success, total: lines.length });

      if (result.success > 0) {
        toast.success(`批量添加完成：成功 ${result.success} 张${result.failed > 0 ? `，失败 ${result.failed} 张` : ''}`);
        setOpen(false);
        onSuccess();
      } else {
        const firstError = result.results.find(item => !item.success)?.error;
        toast.error(firstError ? `全部添加失败：${firstError}` : '全部添加失败，请检查 URL 格式');
      }
    } catch (err) {
      toast.error(getErrorMessage(err, '批量添加失败'));
    } finally {
      setLoading(false);
    }
  };

  const handleSingleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void (async () => {
      if (!(await onRequireToken())) return;

      if (!url.trim()) { toast.error('请输入图片地址'); return; }
      setLoading(true);
      singleMutation.mutate(undefined, { onSettled: () => setLoading(false) });
    })();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 gradient-button rounded-full border-0 text-white">
          <Plus className="w-4 h-4" />
          添加图片
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-strong rounded-2xl sm:max-w-lg sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="w-5 h-5 text-blue-500" />
            添加外链图片
          </DialogTitle>
        </DialogHeader>

        {/* 模式切换 */}
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Button
            variant={mode === 'single' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('single')}
            className={`text-xs h-8 rounded-full ${mode === 'single' ? 'bg-primary text-primary-foreground' : ''}`}
          >
            单张添加
          </Button>
          <Button
            variant={mode === 'batch' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('batch')}
            className={`text-xs h-8 rounded-full ${mode === 'batch' ? 'bg-primary text-primary-foreground' : ''}`}
          >
            批量添加
          </Button>
        </div>

        {mode === 'single' ? (
          <form onSubmit={handleSingleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="url">图片地址 *</Label>
              <Input id="url" className="rounded-lg bg-secondary/30 border-border/70" placeholder="https://example.com/image.jpg" value={url} onChange={e => setUrl(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">标题</Label>
              <Input id="title" className="rounded-lg bg-secondary/30 border-border/70" placeholder="给图片起个名字" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">标签（逗号分隔）</Label>
              <Input id="tags" className="rounded-lg bg-secondary/30 border-border/70" placeholder="风景, 自然, 山脉" value={tagsInput} onChange={e => setTagsInput(e.target.value)} />
            </div>
            <Button type="submit" className="w-full gradient-button rounded-full border-0 text-white" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              添加
            </Button>
          </form>
        ) : (
          <form onSubmit={handleBatchSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="batch-urls">图片地址（每行一个）*</Label>
              <textarea
                id="batch-urls"
                placeholder={"https://example.com/image1.jpg\nhttps://example.com/image2.jpg\nhttps://example.com/image3.jpg"}
                value={batchUrls}
                onChange={e => setBatchUrls(e.target.value)}
                required
                rows={6}
                className="w-full min-h-[140px] rounded-lg border border-border/70 bg-secondary/30 px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y font-mono"
              />
              <p className="text-xs text-muted-foreground">每行一个图片 URL，重复地址会自动合并，单次最多 {MAX_BATCH_IMAGE_COUNT} 张</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="batch-tags">统一标签（逗号分隔，可选）</Label>
              <Input id="batch-tags" className="rounded-lg bg-secondary/30 border-border/70" placeholder="风景, 自然" value={batchTags} onChange={e => setBatchTags(e.target.value)} />
              <p className="text-xs text-muted-foreground">所有图片将使用相同的标签</p>
            </div>

            {/* 进度条 */}
            {loading && progress.total > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>添加进度</span>
                  <span>{progress.current} / {progress.total}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-fuchsia-500 rounded-full transition-all duration-300"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <Button type="submit" className="w-full gradient-button rounded-full border-0 text-white" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              批量添加
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Edit Image Dialog
// ============================================================

function EditImageDialog({
  image,
  adminToken,
  onSuccess,
  onRequireToken,
}: {
  image: ImageRecord;
  adminToken: string;
  onSuccess: () => void;
  onRequireToken: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) { setUrl(image.url); setTitle(image.title); setTagsInput(image.tags.join(', ')); }
  }, [open, image]);

  const mutation = useMutation({
    mutationFn: () => updateImage(image.id, { url: url.trim(), title: title.trim(), tags: parseTagsInput(tagsInput) }, adminToken),
    onSuccess: () => { toast.success('图片更新成功'); setOpen(false); onSuccess(); },
    onError: (err) => { toast.error(getErrorMessage(err, '更新失败')); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void (async () => {
      if (!(await onRequireToken())) return;

      if (!url.trim()) { toast.error('请输入图片地址'); return; }
      setLoading(true);
      mutation.mutate(undefined, { onSettled: () => setLoading(false) });
    })();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white/80 hover:text-white hover:bg-white/20" aria-label="编辑图片">
          <Edit3 className="w-3.5 h-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-strong rounded-2xl sm:max-w-md sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-blue-500" />
            编辑图片
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="edit-url">图片地址</Label>
            <Input id="edit-url" className="rounded-lg bg-secondary/30 border-border/70" value={url} onChange={e => setUrl(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-title">标题</Label>
            <Input id="edit-title" className="rounded-lg bg-secondary/30 border-border/70" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-tags">标签</Label>
            <Input id="edit-tags" className="rounded-lg bg-secondary/30 border-border/70" value={tagsInput} onChange={e => setTagsInput(e.target.value)} />
          </div>
          <Button type="submit" className="w-full gradient-button rounded-full border-0 text-white" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}保存
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Main App
// ============================================================

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('random');
  const [shuffleTrigger, setShuffleTrigger] = useState(0);

  const handleTabChange = (tab: AppTab) => {
    setActiveTab(tab);
    if (tab === 'random') setShuffleTrigger(0);
  };

  return (
    <div id="top" className="min-h-screen relative overflow-hidden page-bg">
      <AmbientBackground />
      <Header activeTab={activeTab} onTabChange={handleTabChange} />

      <main>
        {/* 随机页面 */}
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

        {/* 图库页面 */}
        {activeTab === 'gallery' && <GalleryPage />}

        {/* API 文档页面 */}
        {activeTab === 'docs' && (
          <section className="py-2">
            <ApiDocsSection />
            <div className="max-w-4xl mx-auto px-4 sm:px-6 mt-2">
              <div className="p-6 rounded-2xl glass-strong">
                <h3 className="font-semibold text-base mb-5 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-blue-500" />
                  安全防护与性能优化
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { icon: Shield, title: 'URL 校验', desc: '添加图片时自动校验 URL 格式' },
                    { icon: Database, title: '去重检测', desc: '相同 URL 自动拒绝' },
                    { icon: Zap, title: '边缘计算', desc: 'ESA 边缘节点，延迟 <50ms' },
                    { icon: Globe, title: 'EdgeKV 存储', desc: '数据持久化在边缘节点' },
                    { icon: Code, title: 'CORS 支持', desc: '所有接口支持跨域请求' },
                    { icon: ExternalLink, title: '302 重定向', desc: '支持 redirect 模式直链' },
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

      {/* Footer */}
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
                © {new Date().getFullYear()} 派立方
              </span>
            </div>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <p className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1">
                <span>本站由</span>
                <img
                  src={APP_LOGO_URL}
                  alt="PAIII Logo"
                  width={16}
                  height={16}
                  loading="lazy"
                  decoding="async"
                  className="h-4 w-4 inline-block mx-0.5"
                />
                <span>PAIII 提供技术和图床支持</span>
              </p>
              <p className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1">
                <span>本站由</span>
                <img
                  src={EDGEONE_LOGO_URL}
                  alt="EdgeOne Logo"
                  width={92}
                  height={16}
                  loading="lazy"
                  decoding="async"
                  className="h-4 w-auto inline-block mx-0.5"
                />
                <span>企业版提供 CDN 支持</span>
              </p>
            </div>
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-center justify-center gap-y-3 sm:gap-x-8 text-sm text-muted-foreground max-w-full">
              <a
                href="#changelog"
                className="hover:text-foreground transition-colors sm:hidden"
              >
                更新日志
              </a>
              <a
                href="https://paiii.cn"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                派立方社区
                <ExternalLink className="w-3 h-3 shrink-0" aria-hidden />
              </a>
              <a
                href={APP_DOMAIN}
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
                蜀ICP备2022012020号-4
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
