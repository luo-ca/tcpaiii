import { lazy, Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  Camera,
  ExternalLink,
  BarChart3,
  Image,
  Sparkles,
  Tag,
  Check,
  Code,
  Globe,
  Shield,
  Zap,
  Database,
  ChevronRight,
  RefreshCw,
  Search,
  TrendingUp,
  Clock,
  Layers,
  Heart,
  Mail,
  MessageSquare,
  Shuffle,
  Copy as CopyIcon,
  ArrowRight,
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

type AppTab = 'random' | 'gallery' | 'docs';

type ApiErrorPayload = {
  error?: string;
  message?: string;
};

const API_HTML_FALLBACK_MESSAGE = 'API returned HTML instead of JSON. Please check whether the Edge function is deployed correctly.';

const HEADER_TABS: Array<{ key: AppTab; label: string; icon: typeof Shuffle }> = [
  { key: 'random', label: '随机', icon: Shuffle },
  { key: 'gallery', label: '图库', icon: Image },
  { key: 'docs', label: 'API 文档', icon: Code },
];

const APP_NAME = '派次元 API';
const APP_FALLBACK_DOMAIN = 'https://t.paiii.cn';
const APP_LOGO_URL = 'https://static.paiii.cn/logo.svg';
const HERO_FALLBACK_IMAGE_URL = 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=cinematic%20anime%20illustration%20of%20two%20original%20girls%20in%20a%20soft%20blue%20evening%20city%20scene%2C%20detailed%20kimono%20and%20modern%20street%20lights%2C%20warm%20smile%2C%20floating%20petals%2C%20high%20quality%20website%20hero%20background%2C%20wide%20composition%2C%20no%20text%2C%20no%20logo&image_size=landscape_16_9';
const EDGEONE_LOGO_URL = 'https://edgeone.ai/_next/static/media/headLogo.daeb48ad.png';
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
  const method = (init?.method
    || (input instanceof Request ? input.method : undefined)
    || 'GET').toUpperCase();
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
    throw new Error(`${fallback}: invalid JSON response`);
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

async function fetchStats(): Promise<Stats> {
  return apiRequest<Stats>('/api/stats', undefined, 'Failed to fetch stats');
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
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
      scrolled
        ? 'border-b border-white/30 bg-white/80 shadow-[0_8px_32px_rgba(15,23,42,0.08)] backdrop-blur-2xl'
        : 'border-b border-white/15 bg-white/60 backdrop-blur-xl'
    }`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex h-14 sm:h-16 items-center justify-between gap-3">
          {/* Logo */}
          <button
            type="button"
            onClick={() => onTabChange('random')}
            className="flex items-center gap-2.5 group text-left shrink-0 min-w-0 rounded-xl -ml-2 pl-2 pr-2 py-1.5 hover:bg-black/5 transition-all duration-200"
            aria-label="返回随机图片页面"
          >
            <div className="relative">
              <img
                src={APP_LOGO_URL}
                alt={`${APP_NAME} Logo`}
                width={32}
                height={32}
                className="w-8 h-8 rounded-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
              />
            </div>
            <span className="truncate font-bold text-base sm:text-[17px] tracking-tight text-foreground/90">
              {APP_NAME}
            </span>
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-0.5 rounded-xl bg-secondary/60 p-1">
            {HEADER_TABS.map(item => (
              <button
                key={item.key}
                type="button"
                onClick={() => onTabChange(item.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
                  activeTab === item.key
                    ? 'bg-white text-foreground shadow-sm shadow-black/5'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/60'
                }`}
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            ))}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <a
              href="https://paiii.cn"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-secondary/60"
            >
              <span>PAIII</span>
              <ExternalLink className="w-3 h-3" aria-hidden />
            </a>
            <Button
              variant="ghost"
              size="icon"
              className="w-9 h-9 rounded-lg hover:bg-secondary/70 transition-colors md:hidden"
              onClick={() => onTabChange(activeTab === 'random' ? 'gallery' : 'random')}
              aria-label="切换页面"
            >
              {activeTab === 'random' ? <Image className="w-4 h-4" /> : <Shuffle className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <nav className="grid grid-cols-3 gap-1 pb-2 md:hidden">
          {HEADER_TABS.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => onTabChange(item.key)}
              className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-all duration-200 ${
                activeTab === item.key
                  ? 'bg-white text-foreground shadow-sm shadow-black/5'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/60'
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
  const [tagInput, setTagInput] = useState('');
  const { data: stats } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 15000,
    staleTime: 0,
  });
  const [heroImageUrl, setHeroImageUrl] = useState(HERO_FALLBACK_IMAGE_URL);
  const statBadges = [
    { label: '图库图片', value: `${formatNumber(stats?.totalImages ?? 0)} 张`, icon: Image },
    { label: '标签分类', value: `${formatNumber(stats?.tags?.length ?? 0)} 个`, icon: Tag },
    { label: '今日调用', value: `${formatNumber(stats?.todayRequests ?? 0)} 次`, icon: TrendingUp },
    { label: '累计调用', value: `${formatNumber(stats?.totalRequests ?? 0)} 次`, icon: Globe },
  ];

  useEffect(() => {
    let cancelled = false;

    fetchRandomImage()
      .then(image => {
        if (!cancelled && image.url) {
          setHeroImageUrl(image.url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHeroImageUrl(HERO_FALLBACK_IMAGE_URL);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = () => {
    const keyword = tagInput.trim();
    const preview = document.getElementById('preview');
    preview?.scrollIntoView({ behavior: 'smooth' });
    if (keyword) {
      window.dispatchEvent(new CustomEvent('paiii:select-tag', { detail: keyword }));
    }
    onShuffle();
  };

  return (
    <section className="relative isolate min-h-[640px] overflow-hidden pt-20 sm:pt-24">
      {/* Hero Background */}
      <img
        src={heroImageUrl}
        alt="派次元随机图片背景"
        className="absolute inset-0 -z-20 h-full w-full object-cover"
      />
      {/* Gradient Overlay */}
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(4,8,20,0.40)_0%,rgba(4,8,20,0.68)_60%,rgba(4,8,20,0.85)_100%)]" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_50%_30%,rgba(59,100,246,0.20),transparent)]" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-48 bg-gradient-to-t from-background via-background/60 to-transparent" />

      {/* Floating particles (decorative) */}
      <div className="absolute top-1/4 left-1/4 -z-10 w-1.5 h-1.5 rounded-full bg-blue-400/40 blur-[0px] animate-[float_5s_ease-in-out_infinite]" />
      <div className="absolute top-1/3 right-1/3 -z-10 w-1 h-1 rounded-full bg-purple-400/40 animate-[float_7s_ease-in-out_infinite_1s]" />
      <div className="absolute top-2/3 right-1/4 -z-10 w-2 h-2 rounded-full bg-cyan-400/30 animate-[float_6s_ease-in-out_infinite_2s]" />

      <div className="mx-auto flex min-h-[580px] max-w-6xl flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
        {/* Eyebrow Badge */}
        <div className="highlight-badge mb-6">
          <Sparkles className="h-3.5 w-3.5 text-sky-200" />
          <span>二次元图片 · EdgeOne 加速 · JSON / 302 双模式</span>
        </div>

        {/* Main Title */}
        <h1 className="max-w-4xl text-5xl font-black tracking-tight text-white sm:text-6xl md:text-7xl leading-[1.08]">
          <span className="block">anime images</span>
          <span className="block text-transparent bg-clip-text bg-gradient-to-r from-sky-300 via-blue-300 to-violet-300">
            for anyone
          </span>
        </h1>

        <p className="mt-5 max-w-xl text-base leading-7 text-white/75 sm:text-[17px]">
          免费、稳定、快速的二次元随机图片 API。适合博客头图、论坛签名、Markdown 文档、应用占位图和 ACG 主题站点快速接入。
        </p>

        {/* Search Box */}
        <div className="mt-8 w-full max-w-xl">
          <div className="relative flex items-center rounded-2xl bg-white/95 shadow-[0_8px_40px_rgba(0,0,0,0.25)] border border-white/20 overflow-hidden backdrop-blur-xl">
            <div className="flex flex-1 items-center gap-2 px-4">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <Input
                value={tagInput}
                onChange={event => setTagInput(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') handleSubmit();
                }}
                placeholder="搜索标签：acg、壁纸、头像..."
                className="h-12 border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0 placeholder:text-slate-400/80"
              />
            </div>
            <div className="p-1.5 pr-2">
              <Button
                className="h-9 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-5 text-white text-sm font-medium shadow-md shadow-blue-600/25 hover:shadow-blue-600/40 transition-all duration-200 hover:-translate-y-0.5"
                onClick={handleSubmit}
              >
                随机获取
                <Shuffle className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="mt-7 flex max-w-3xl flex-wrap items-center justify-center gap-2.5">
          {statBadges.map(item => (
            <div
              key={item.label}
              className="flex items-center gap-2 rounded-xl border border-white/14 bg-black/25 px-3.5 py-2 text-xs text-white/88 backdrop-blur-lg sm:text-sm"
            >
              <item.icon className="h-3.5 w-3.5 text-white/55 shrink-0" />
              <span className="text-white/55">{item.label}</span>
              <span className="font-bold text-white">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

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
      const message = getErrorMessage(err, '获取随机图片失败');
      setPreviewError(message);
      toast.error(message);
      setImageLoading(false);
    }
  }, [queryClient]);

  const handleSelectTag = useCallback((tag?: string) => {
    setSelectedTag(tag);
    shuffleImage(tag);
  }, [shuffleImage]);

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

  useEffect(() => {
    const handleExternalTag = (event: Event) => {
      const tag = event instanceof CustomEvent && typeof event.detail === 'string' ? event.detail.trim() : '';
      if (tag) handleSelectTag(tag);
    };

    window.addEventListener('paiii:select-tag', handleExternalTag);
    return () => window.removeEventListener('paiii:select-tag', handleExternalTag);
  }, [handleSelectTag]);

  const hasImage = imageUrl && imageLoaded && !previewError;

  return (
    <section id="preview" className="relative z-10 py-16 sm:py-20 px-4 sm:px-6 scroll-mt-20">
      <div className="mx-auto max-w-6xl">
        {/* Section Header */}
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-blue-500">Daily Picks</p>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">热门二次元图片</h2>
            <p className="mt-2 text-muted-foreground text-sm">刷新随机图片，复制可直接接入的图片地址。</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/60 rounded-full px-3 py-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span>实时更新</span>
          </div>
        </div>

        {/* Browser Preview Card */}
        <div className="overflow-hidden rounded-[1.5rem] border border-white/60 bg-white/75 shadow-[0_20px_60px_rgba(15,23,42,0.08),0_4px_16px_rgba(15,23,42,0.04)] backdrop-blur-xl">
          {/* Browser Chrome Bar */}
          <div className="flex items-center gap-3 border-b border-slate-200/60 bg-slate-50/80 px-4 py-3">
            <div className="hidden items-center gap-1.5 sm:flex shrink-0">
              <div className="browser-dot browser-dot-red" />
              <div className="browser-dot browser-dot-yellow" />
              <div className="browser-dot browser-dot-green" />
            </div>
            <div className="min-w-0 flex-1 sm:ml-2">
              <div className="truncate rounded-md bg-white/80 border border-slate-200/70 px-3 py-1.5 text-xs text-muted-foreground font-mono shadow-sm">
                {randomApiUrl}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 shrink-0 rounded-lg hover:bg-slate-200/70 transition-all"
              onClick={() => shuffleImage(selectedTag)}
              disabled={imageLoading}
              aria-label="刷新随机图片"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${imageLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* Content Grid */}
          <div className="grid gap-0 lg:grid-cols-[1.3fr_0.7fr]">
            {/* Image Preview Panel */}
            <div className="relative flex min-h-[360px] items-center justify-center overflow-hidden bg-slate-100 sm:min-h-[460px]">
              {imageLoading && (
                <div className="absolute inset-0 z-20 skeleton-shimmer" />
              )}

              {!imageUrl && !imageLoading && !previewError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/40">
                  <Camera className="mb-3 h-16 w-16 opacity-25" />
                  <p className="text-sm">等待加载预览图片</p>
                </div>
              )}

              {previewError && !imageLoading && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/80 p-6 text-center backdrop-blur-md">
                  <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-3">
                    <Camera className="h-8 w-8 text-red-300" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">预览加载失败</p>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">{previewError}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 rounded-full"
                    onClick={() => shuffleImage(selectedTag)}
                  >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    重试
                  </Button>
                </div>
              )}

              {imageUrl && (
                <img
                  key={imageKey}
                  src={imageUrl}
                  alt={imageTitle}
                  className={`h-full w-full object-cover transition-all duration-500 ${
                    imageLoaded && !previewError ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.97]'
                  }`}
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                />
              )}

              {hasImage && (
                <div className="absolute inset-x-0 bottom-0 z-10 p-4 bg-gradient-to-t from-black/80 via-black/45 to-transparent">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="mb-1.5 truncate text-base font-semibold text-white">{imageTitle}</h3>
                      <div className="flex flex-wrap gap-1">
                        {imageTags.map(tag => (
                          <span key={tag} className="rounded-full bg-white/18 px-2 py-0.5 text-xs text-white/88 backdrop-blur-sm border border-white/10">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5 sm:ml-3 sm:flex-nowrap">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 min-w-0 rounded-full border-0 bg-white/18 text-xs text-white backdrop-blur-sm hover:bg-white/28 transition-colors"
                        onClick={copyUrl}
                      >
                        {copied ? <Check className="mr-1 h-3 w-3" /> : <CopyIcon className="mr-1 h-3 w-3" />}
                        {copied ? '已复制' : '复制地址'}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 w-8 rounded-full border-0 bg-white/18 p-0 text-white backdrop-blur-sm hover:bg-white/28 transition-colors"
                        asChild
                      >
                        <a href={imageUrl} target="_blank" rel="noopener noreferrer">
                          <span className="sr-only">打开图片</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar Info Panel */}
            <div className="flex flex-col justify-between gap-5 bg-white/65 p-5 sm:p-6">
              <div>
                <Badge className="mb-4 rounded-full bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-50 text-xs">
                  Random API
                </Badge>
                <h3 className="text-2xl font-black tracking-tight leading-tight">一键获得<br />可用图片</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  当前预览直接调用线上随机接口，复制地址即可在网页、Markdown 或应用中使用。
                </p>
              </div>

              {/* Code Block */}
              <div className="rounded-xl bg-slate-950 overflow-hidden shadow-xl">
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
                  <span className="text-[10px] font-medium text-emerald-400 uppercase tracking-wider">GET</span>
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/15" />
                    <div className="w-1.5 h-1.5 rounded-full bg-white/15" />
                    <div className="w-1.5 h-1.5 rounded-full bg-white/15" />
                  </div>
                </div>
                <div className="p-3">
                  <code className="block break-all text-xs text-slate-300 leading-relaxed">{randomApiUrl}</code>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2.5 text-sm">
                <Button
                  className="rounded-xl h-10 bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-600/20 hover:shadow-blue-600/35 hover:-translate-y-0.5 transition-all duration-200"
                  onClick={() => shuffleImage(selectedTag)}
                  disabled={imageLoading}
                >
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${imageLoading ? 'animate-spin' : ''}`} />
                  换一张
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl h-10 bg-white/70 hover:bg-white/90 transition-all duration-200"
                  onClick={() => copyText(randomApiUrl, 'API 地址已复制')}
                >
                  <CopyIcon className="mr-1.5 h-3.5 w-3.5" />
                  复制 API
                </Button>
              </div>
            </div>
          </div>

          {/* Category Tags Bar */}
          <div className="border-t border-slate-200/60 bg-slate-50/70 p-4">
            <div className="category-strip flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory sm:flex-wrap sm:overflow-visible">
              <button
                type="button"
                className={`category-button shrink-0 snap-start px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
                  selectedTag === undefined
                    ? 'active bg-primary text-primary-foreground shadow-md'
                    : 'bg-white/70 text-muted-foreground border border-slate-200/70 hover:bg-white hover:text-foreground'
                }`}
                onClick={() => handleSelectTag(undefined)}
              >
                全部
              </button>
              {stats?.tags?.map(tag => (
                <button
                  key={tag}
                  type="button"
                  className={`category-button shrink-0 snap-start px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
                    selectedTag === tag
                      ? 'active bg-primary text-primary-foreground shadow-md'
                      : 'bg-white/70 text-muted-foreground border border-slate-200/70 hover:bg-white hover:text-foreground'
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
    {
      label: '总调用量',
      value: formatNumber(stats?.totalRequests ?? 0),
      icon: TrendingUp,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
      gradientFrom: 'from-blue-500',
      gradientTo: 'to-cyan-400',
      sub: '累计请求总次数',
    },
    {
      label: '今日调用',
      value: formatNumber(stats?.todayRequests ?? 0),
      icon: Clock,
      color: 'text-indigo-500',
      bgColor: 'bg-indigo-50',
      gradientFrom: 'from-indigo-500',
      gradientTo: 'to-blue-400',
      sub: stats?.lastRequestAt ? new Date(stats.lastRequestAt).toLocaleDateString('zh-CN') : '暂无数据',
    },
    {
      label: '接入站点',
      value: formatNumber(stats?.totalSites ?? 0),
      icon: Globe,
      color: 'text-cyan-500',
      bgColor: 'bg-cyan-50',
      gradientFrom: 'from-cyan-500',
      gradientTo: 'to-teal-400',
      sub: '使用本 API 的网站',
    },
    {
      label: '图片总数',
      value: formatNumber(stats?.totalImages ?? 0),
      icon: Layers,
      color: 'text-fuchsia-500',
      bgColor: 'bg-fuchsia-50',
      gradientFrom: 'from-fuchsia-500',
      gradientTo: 'to-pink-400',
      sub: `${stats?.tags?.length ?? 0} 个分类`,
    },
  ];

  return (
    <section id="stats" className="relative z-10 py-16 sm:py-20 px-4 sm:px-6 scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <div className="section-header">
          <p className="section-eyebrow">
            <TrendingUp className="w-3.5 h-3.5" />
            实时数据
          </p>
          <h2>实时统计</h2>
          <p>API 调用数据与图库资源概览</p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {statCards.map((card, i) => (
            <Card key={i} className="glass-card rounded-2xl hover-lift border-white/60 overflow-hidden">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-10 h-10 rounded-xl ${card.bgColor} flex items-center justify-center`}>
                    <card.icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                  <div className={`w-1.5 h-8 rounded-full bg-gradient-to-b ${card.gradientFrom} ${card.gradientTo} opacity-40`} />
                </div>
                <p className="text-2xl sm:text-3xl font-black text-foreground tracking-tight stat-value">{card.value}</p>
                <p className="text-xs font-medium text-muted-foreground mt-1">{card.label}</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5 truncate">{card.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Chart Card */}
        <Card className="glass-strong rounded-2xl border-white/60">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-blue-500 to-cyan-400" />
                <span className="text-sm font-semibold">7-day trend</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-blue-50 text-blue-600 border border-blue-100 px-3 py-1 text-xs font-medium">
                  近 7 天 {formatNumber(totalRecentRequests)} 次
                </span>
              </div>
            </div>
            <div className="h-48">
              {hasTrendData ? (
                <ChartContainer
                  config={{
                    requests: {
                      label: 'Requests',
                      color: 'hsl(222 89% 55%)',
                    },
                  }}
                  className="h-full w-full"
                >
                  <AreaChart data={chartData} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="requestsTrend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-requests)" stopOpacity={0.30} />
                        <stop offset="95%" stopColor="var(--color-requests)" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="rgba(15,23,42,0.06)" />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tick={{ fontSize: 11, fill: 'rgba(15,23,42,0.45)' }}
                    />
                    <YAxis
                      width={32}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: 'rgba(15,23,42,0.45)' }}
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
                      dot={{ r: 3, strokeWidth: 2, fill: 'white' }}
                      activeDot={{ r: 5, strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ChartContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground/40">
                  <div className="text-center">
                    <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-25" />
                    <p className="text-sm">暂无调用数据</p>
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
    {
      icon: Zap,
      title: '极速响应',
      desc: '边缘节点加速，毫秒级响应，图片秒开无压力',
      color: 'from-blue-500 to-cyan-400',
      textColor: 'text-blue-500',
      bgColor: 'bg-blue-50',
    },
    {
      icon: Shield,
      title: '稳定可靠',
      desc: 'URL 校验、去重检测，接口输出始终稳定',
      color: 'from-emerald-500 to-teal-400',
      textColor: 'text-emerald-500',
      bgColor: 'bg-emerald-50',
    },
    {
      icon: Tag,
      title: '丰富分类',
      desc: '按标签组织图片，支持随机与定向精准调用',
      color: 'from-indigo-500 to-violet-500',
      textColor: 'text-indigo-500',
      bgColor: 'bg-indigo-50',
    },
    {
      icon: Heart,
      title: '开放使用',
      desc: '无需复杂配置，前端、Markdown、脚本均可接入',
      color: 'from-fuchsia-500 to-pink-500',
      textColor: 'text-fuchsia-500',
      bgColor: 'bg-fuchsia-50',
    },
  ];

  return (
    <section id="features" className="relative z-10 py-16 sm:py-20 px-4 sm:px-6 scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <div className="section-header">
          <p className="section-eyebrow">
            <Sparkles className="w-3.5 h-3.5" />
            核心优势
          </p>
          <h2>为什么选择随机图片 API</h2>
          <p>简单、快速、可靠的随机图片接口服务</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f, i) => (
            <Card
              key={i}
              className="glass-card rounded-2xl hover-lift border-white/60 group"
            >
              <CardContent className="p-6">
                <div className={`feature-icon-wrap w-12 h-12 rounded-2xl bg-gradient-to-br ${f.color} flex items-center justify-center text-white mb-5 shadow-lg`}>
                  <f.icon className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-[17px] text-foreground mb-2 tracking-tight">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                <div className={`mt-4 flex items-center gap-1 text-xs font-medium ${f.textColor} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}>
                  <span>了解更多</span>
                  <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                </div>
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

  const CodeRow = ({
    label,
    code,
    onCopy,
  }: {
    label?: string;
    code: string;
    onCopy: () => void;
  }) => (
    <div className="group flex flex-col gap-2.5 p-3.5 bg-muted/35 rounded-xl border border-border/40 hover:bg-muted/55 transition-colors sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        {label && <p className="text-xs text-muted-foreground mb-1.5 font-medium">{label}</p>}
        <code className="block overflow-x-auto break-all text-sm text-foreground/85 font-mono leading-relaxed sm:whitespace-nowrap">{code}</code>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 justify-center card-button rounded-lg gap-1"
        onClick={onCopy}
      >
        <CopyIcon className="w-3 h-3" />
        <span className="text-xs">复制</span>
      </Button>
    </div>
  );

  return (
    <section id="api" className="relative z-10 py-16 sm:py-20 px-4 sm:px-6 scroll-mt-20">
      <div className="section-header">
        <p className="section-eyebrow">
          <Code className="w-3.5 h-3.5" />
          开发文档
        </p>
        <h2>API 文档</h2>
        <p>复制即可接入，支持直链、分类和 JSON 元数据返回</p>
      </div>

      <div className="max-w-4xl mx-auto">
        <Tabs value={activeDocTab} onValueChange={setActiveDocTab}>
          <TabsList className="grid w-full h-auto grid-cols-2 sm:grid-cols-4 gap-1 glass rounded-xl p-1.5 min-h-[3rem] mb-6 border border-white/60">
            <TabsTrigger value="basic" className="rounded-lg text-xs sm:text-sm px-2.5 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:shadow-black/5">基础调用</TabsTrigger>
            <TabsTrigger value="params" className="rounded-lg text-xs sm:text-sm px-2.5 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:shadow-black/5">分类参数</TabsTrigger>
            <TabsTrigger value="json" className="rounded-lg text-xs sm:text-sm px-2.5 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:shadow-black/5">JSON 返回</TabsTrigger>
            <TabsTrigger value="advanced" className="rounded-lg text-xs sm:text-sm px-2.5 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:shadow-black/5">高级用法</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="mt-2 space-y-3">
            <Card className="glass-strong rounded-2xl border-white/60">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Code className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold">基础调用</span>
                    <p className="text-xs text-muted-foreground">默认返回 302 图片直链；追加 format=json 获取 JSON 元数据</p>
                  </div>
                </div>
                <div className="space-y-2.5">
                  <CodeRow label="API 地址（默认 302）" code={randomApiUrl} onCopy={() => copyCode(randomApiUrl)} />
                  <CodeRow label="HTML 使用示例" code={`<img src="${randomApiUrl}" alt="随机图片" />`} onCopy={() => copyCode(`<img src="${randomApiUrl}" alt="随机图片" />`)} />
                  <CodeRow label="Markdown 使用示例" code={`![随机图片](${randomApiUrl})`} onCopy={() => copyCode(`![随机图片](${randomApiUrl})`)} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="params" className="mt-2">
            <Card className="glass-strong rounded-2xl border-white/60">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                    <Tag className="w-4 h-4 text-indigo-500" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold">分类参数</span>
                    <p className="text-xs text-muted-foreground">通过 tag 参数指定图片分类</p>
                  </div>
                </div>
                <CodeRow code={randomTagApiUrl} onCopy={() => copyCode(randomTagApiUrl)} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="json" className="mt-2">
            <Card className="glass-strong rounded-2xl border-white/60">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center">
                    <Code className="w-4 h-4 text-cyan-500" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold">JSON 返回模式</span>
                    <p className="text-xs text-muted-foreground">追加 format=json 返回 JSON 数据，包含图片 URL、标题、标签等</p>
                  </div>
                </div>
                <div className="space-y-2.5">
                  <CodeRow code={randomJsonApiUrl} onCopy={() => copyCode(randomJsonApiUrl)} />
                  <div className="rounded-xl overflow-hidden code-block">
                    <div className="code-block-header">
                      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Response</span>
                      <span className="text-[10px] text-emerald-400">application/json</span>
                    </div>
                    <div className="p-4">
                      <pre className="text-xs text-slate-300 overflow-x-auto leading-relaxed">
{`{
  "id": "img-001",
  "url": "https://example.com/image.jpg",
  "title": "二次元插画",
  "tags": ["acg", "二次元"],
  "createdAt": "2025-01-15T08:00:00Z"
}`}
                      </pre>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="advanced" className="mt-2">
            <Card className="glass-strong rounded-2xl border-white/60">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold">高级用法</span>
                    <p className="text-xs text-muted-foreground">JavaScript 与命令行调用示例</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="rounded-xl overflow-hidden code-block">
                    <div className="code-block-header">
                      <span className="text-[10px] font-medium text-amber-400 uppercase tracking-wider">JavaScript</span>
                    </div>
                    <div className="p-4">
                      <pre className="text-xs text-slate-300 overflow-x-auto leading-relaxed">
{`fetch('/api/random?format=json')
  .then(r => r.json())
  .then(data => console.log(data.url))`}
                      </pre>
                    </div>
                  </div>
                  <div className="rounded-xl overflow-hidden code-block">
                    <div className="code-block-header">
                      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">cURL</span>
                    </div>
                    <div className="p-4">
                      <pre className="text-xs text-slate-300 overflow-x-auto leading-relaxed">
{`curl ${randomApiUrl}`}
                      </pre>
                    </div>
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
    <section id="contribute" className="relative z-10 py-16 sm:py-20 px-4 sm:px-6 scroll-mt-20">
      <div className="section-header">
        <p className="section-eyebrow">
          <Heart className="w-3.5 h-3.5" />
          一起建设
        </p>
        <h2>图片投稿</h2>
        <p>欢迎投稿高质量图片，共建优质图片库</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl mx-auto">
        <Card className="glass-card rounded-2xl hover-lift border-white/60">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Mail className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">QQ 联系</h3>
                <p className="text-xs text-muted-foreground mt-0.5">添加 QQ 好友投稿图片资源</p>
              </div>
            </div>
            <div className="bg-blue-50/60 rounded-xl p-3 text-center border border-blue-100/60">
              <code className="text-sm font-semibold text-blue-700">2553256126</code>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card rounded-2xl hover-lift border-white/60">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-indigo-500" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">社区发帖</h3>
                <p className="text-xs text-muted-foreground mt-0.5">在派立方社区发帖投稿</p>
              </div>
            </div>
            <div className="text-center">
              <Button
                size="sm"
                className="gradient-button rounded-xl border-0 text-white text-xs h-9 px-4"
                asChild
              >
                <a href="https://www.paiii.cn/bbs/9" target="_blank" rel="noreferrer">
                  前往投稿
                  <ChevronRight className="w-3.5 h-3.5 ml-1" />
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
      tag: 'Major',
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
      tag: 'Update',
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
      tag: 'API',
      items: [
        '分类统一使用 api/random?tag=xx，并兼容旧版 type=xx 参数',
        'JSON 返回图片 id、url、title、tags、createdAt，统计接口新增最近 7 天调用数据',
      ],
    },
  ];

  const tagColors: Record<string, string> = {
    Major: 'bg-blue-50 text-blue-600 border-blue-100',
    Update: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    API: 'bg-amber-50 text-amber-600 border-amber-100',
  };

  return (
    <section id="changelog" className="relative z-10 py-16 sm:py-20 px-4 sm:px-6 scroll-mt-20">
      <div className="section-header">
        <p className="section-eyebrow">
          <Clock className="w-3.5 h-3.5" />
          版本历史
        </p>
        <h2>更新日志</h2>
        <p>展示站点与接口说明的调整记录（持续更新）</p>
      </div>

      <div className="max-w-3xl mx-auto space-y-5">
        {updates.map((update, i) => (
          <div key={i} className="flex gap-5">
            {/* Timeline indicator */}
            <div className="flex flex-col items-center shrink-0">
              <div className="w-3 h-3 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 mt-2 ring-4 ring-background shadow-[0_0_0_1px_rgba(29,111,235,0.3)]" />
              {i < updates.length - 1 && (
                <div className="w-px flex-1 mt-2 bg-gradient-to-b from-border to-transparent" />
              )}
            </div>

            <Card className="glass-card rounded-2xl flex-1 hover-lift border-white/60">
              <CardContent className="p-5">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-xs text-muted-foreground font-mono">{update.date}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${tagColors[update.tag] ?? ''}`}>
                    {update.tag}
                  </span>
                  <span className="text-sm font-semibold text-foreground">{update.title}</span>
                </div>
                <ul className="space-y-1.5">
                  {update.items.map((item, j) => (
                    <li key={j} className="text-sm text-muted-foreground flex items-start gap-2 leading-relaxed">
                      <span className="text-blue-400 mt-1.5 shrink-0 select-none text-[8px]">●</span>
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
// Docs Full Page Security Section
// ============================================================

function SecurityFeatures() {
  const items = [
    { icon: Shield, title: 'URL 校验', desc: '添加图片时自动校验 URL 格式', color: 'text-blue-500', bg: 'bg-blue-50' },
    { icon: Database, title: '重复拦截', desc: '相同 URL 会自动阻止重复添加', color: 'text-indigo-500', bg: 'bg-indigo-50' },
    { icon: Zap, title: '边缘计算', desc: 'EdgeOne 边缘节点，延迟<50ms', color: 'text-amber-500', bg: 'bg-amber-50' },
    { icon: Globe, title: 'KV 存储', desc: '数据持久化在边缘节点', color: 'text-cyan-500', bg: 'bg-cyan-50' },
    { icon: Code, title: 'CORS 支持', desc: '接口支持跨域调用与前端直接接入', color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { icon: ExternalLink, title: '302 直链', desc: '默认以重定向方式返回图片链接', color: 'text-fuchsia-500', bg: 'bg-fuchsia-50' },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 mt-4 pb-4">
      <div className="p-6 rounded-2xl glass-strong border border-white/60">
        <h3 className="font-bold text-base mb-5 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
            <Shield className="w-4 h-4 text-blue-500" />
          </div>
          安全防护与性能优化
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3.5 rounded-xl hover:bg-muted/30 transition-colors group"
            >
              <div className={`w-9 h-9 rounded-xl ${item.bg} flex items-center justify-center shrink-0 mt-0.5 transition-transform duration-200 group-hover:scale-110`}>
                <item.icon className={`w-4.5 h-4.5 ${item.color}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground/90">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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
          <Suspense
            fallback={
              <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-24 sm:py-28">
                <div className="mb-8 flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="h-8 w-36 rounded-xl skeleton-shimmer" />
                    <div className="h-4 w-52 rounded-xl skeleton-shimmer" />
                  </div>
                  <div className="h-10 w-28 rounded-xl skeleton-shimmer" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="aspect-video rounded-2xl skeleton-shimmer" style={{ animationDelay: `${i * 0.1}s` }} />
                  ))}
                </div>
              </div>
            }
          >
            <GalleryPage />
          </Suspense>
        )}

        {activeTab === 'docs' && (
          <section className="py-2">
            <ApiDocsSection />
            <SecurityFeatures />
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 mt-4 border-t border-border/40 bg-secondary/20 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex flex-col items-center justify-center gap-6 text-center">
            {/* Brand */}
            <div className="flex items-center gap-2.5">
              <img
                src={APP_LOGO_URL}
                alt={`${APP_NAME} Logo`}
                width={28}
                height={28}
                loading="lazy"
                decoding="async"
                className="w-7 h-7 rounded-lg"
              />
              <span className="font-bold text-base">{APP_NAME}</span>
              <span className="text-muted-foreground text-sm">©&nbsp;{new Date().getFullYear()} 派立方</span>
            </div>

            {/* Powered By */}
            <div className="flex flex-col gap-2 text-xs text-muted-foreground/70">
              <p className="flex flex-wrap items-center justify-center gap-1.5">
                <span>Site powered by</span>
                <img
                  src={APP_LOGO_URL}
                  alt="PAIII Logo"
                  width={14}
                  height={14}
                  loading="lazy"
                  decoding="async"
                  className="h-3.5 w-3.5 inline-block opacity-70"
                />
                <span>派立方提供站点与图库平台支持</span>
              </p>
              <p className="flex flex-wrap items-center justify-center gap-1.5">
                <span>CDN 支持来自</span>
                <img
                  src={EDGEONE_LOGO_URL}
                  alt="EdgeOne Logo"
                  width={80}
                  height={14}
                  loading="lazy"
                  decoding="async"
                  className="h-3.5 w-auto inline-block opacity-70"
                />
              </p>
            </div>

            {/* Links */}
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <a href="#changelog" className="hover:text-foreground transition-colors sm:hidden">
                更新日志
              </a>
              <a
                href="https://paiii.cn"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                派立方社区
                <ExternalLink className="w-2.5 h-2.5" aria-hidden />
              </a>
              <a
                href={appUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                {APP_NAME}
                <ExternalLink className="w-2.5 h-2.5" aria-hidden />
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
