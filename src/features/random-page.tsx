import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, Check, ChevronRight, Code, ExternalLink, Heart, Image, RefreshCw, Shield, Sparkles, Tag, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/utils';

const HomeStats = lazy(() => import('@/features/home-stats'));
const HomeExtras = lazy(() => import('@/features/home-extras'));
const ApiDocsSection = lazy(() => import('@/features/docs-page').then(module => ({ default: module.ApiDocsSection })));

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

const APP_NAME = '娲炬鍏?API';
const APP_FALLBACK_DOMAIN = 'https://t.paiii.cn';
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

function isJsonContentType(contentType: string): boolean {
  return contentType.includes('application/json') || contentType.includes('+json');
}

async function readTextSafely(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

async function apiRequest<T>(input: RequestInfo | URL, init: RequestInit | undefined, fallback: string): Promise<T> {
  const response = await fetch(input, {
    ...init,
    cache: 'no-store',
  });
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

  if (!response.ok) {
    const body = await readTextSafely(response.clone());
    throw new Error(body || fallback);
  }

  if (!isJsonContentType(contentType)) {
    throw new Error(`${fallback}: received non-JSON response`);
  }

  return await response.json() as T;
}

async function fetchRandomImage(tag?: string): Promise<ImageRecord> {
  const params = new URLSearchParams();
  if (tag) params.set('tag', tag);
  params.set('format', 'json');
  const query = params.toString();
  return apiRequest<ImageRecord>(buildApiPath(`/api/random${query ? `?${query}` : ''}`), undefined, 'Failed to fetch random image');
}

async function fetchStats(): Promise<Stats> {
  return apiRequest<Stats>(buildApiPath('/api/stats'), undefined, 'Failed to fetch stats');
}

async function copyText(text: string, successMessage = 'Copied to clipboard') {
  try {
    await copyToClipboard(text);
    toast.success(successMessage);
    return true;
  } catch (err) {
    toast.error(getErrorMessage(err, 'Copy failed. Please copy manually.'));
    return false;
  }
}

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
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass mb-6" style={{ animation: 'slide-up 0.6s ease-out forwards' }}>
          <Sparkles className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-medium">Free · Stable · Fast</span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-4" style={{ animation: 'slide-up 0.6s ease-out 0.1s both' }}>
          <span className="text-gradient">{APP_NAME}</span>
        </h1>

        <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 text-balance" style={{ animation: 'slide-up 0.6s ease-out 0.2s both' }}>
          Free random image API service with tag filters, direct image redirects, and metadata responses.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3" style={{ animation: 'slide-up 0.6s ease-out 0.3s both' }}>
          <Button size="lg" onClick={scrollToPreview} className="gradient-button rounded-full px-8 text-white border-0">
            Start preview
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
          <Button size="lg" variant="outline" className="rounded-full px-8 glass hover:bg-secondary/50 transition-all hover:border-primary/50" onClick={scrollToDocs}>
            API Docs
            <Code className="w-4 h-4 ml-1" />
          </Button>
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
      const message = getErrorMessage(err, 'Failed to fetch random image');
      setPreviewError(message);
      toast.error(message);
      setImageLoading(false);
    }
  }, [queryClient]);

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    void shuffleImage();
  }, [shuffleImage]);

  useEffect(() => {
    if (shuffleTrigger > prevTriggerRef.current) {
      prevTriggerRef.current = shuffleTrigger;
      void shuffleImage(selectedTag);
    }
  }, [shuffleTrigger, shuffleImage, selectedTag]);

  const handleImageLoad = () => {
    setImageLoading(false);
    setImageLoaded(true);
    setPreviewError(null);
  };

  const handleImageError = () => {
    const message = 'Image failed to load. Please try again.';
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
    void shuffleImage(tag);
  };

  const hasImage = imageUrl && imageLoaded && !previewError;

  return (
    <section id="preview" className="relative z-10 py-14 sm:py-16 px-4 sm:px-6 scroll-mt-20">
      <div className="max-w-4xl mx-auto">
        <div className="section-header animate-slide-up">
          <h2>Live Preview</h2>
          <p>Try random image delivery instantly, with optional tag filters.</p>
        </div>

        <div className="browser-window glass-strong rounded-2xl shadow-2xl shadow-black/5 hover-lift">
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
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0 hover:bg-primary/10 transition-all" onClick={() => void shuffleImage(selectedTag)} disabled={imageLoading} aria-label="Refresh random image">
              <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${imageLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <div className="relative bg-secondary/30 min-h-[300px] sm:min-h-[400px] aspect-[16/10] flex items-center justify-center overflow-hidden">
            {imageLoading && <div className="absolute inset-0 skeleton-shimmer z-20" />}

            {!imageUrl && !imageLoading && !previewError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/50">
                <Camera className="w-16 h-16 mb-3 opacity-30" />
                <p className="text-sm">No preview image yet</p>
              </div>
            )}

            {previewError && !imageLoading && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/75 p-6 text-center backdrop-blur-md">
                <Camera className="w-14 h-14 mb-3 text-muted-foreground/30" />
                <p className="text-sm font-medium text-foreground">Preview failed to load</p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">{previewError}</p>
                <Button variant="outline" size="sm" className="mt-4 rounded-full glass" onClick={() => void shuffleImage(selectedTag)}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Retry
                </Button>
              </div>
            )}

            {imageUrl && (
              <img
                key={imageKey}
                src={imageUrl}
                alt={imageTitle}
                className={`w-full h-full object-cover transition-all duration-500 ${imageLoaded && !previewError ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
                onLoad={handleImageLoad}
                onError={handleImageError}
              />
            )}

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
                    <Button size="sm" variant="secondary" className="h-7 min-w-0 text-xs bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white border-0" onClick={() => void copyUrl()}>
                      {copied ? <Check className="w-3 h-3 mr-1" /> : <Code className="w-3 h-3 mr-1" />}
                      Copy
                    </Button>
                    <Button size="sm" variant="secondary" className="h-7 w-7 p-0 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white border-0" asChild>
                      <a href={imageUrl} target="_blank" rel="noopener noreferrer">
                        <span className="sr-only">Open image</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-border/50 bg-secondary/20">
            <div className="category-strip flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory sm:flex-wrap sm:overflow-visible">
              <button
                type="button"
                className={`category-button shrink-0 snap-start px-3 py-1.5 rounded-full text-sm font-medium transition-all ${selectedTag === undefined ? 'active bg-primary text-primary-foreground shadow-sm scale-105' : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:scale-105'}`}
                onClick={() => handleSelectTag(undefined)}
              >
                All
              </button>
              {stats?.tags?.map(tag => (
                <button
                  key={tag}
                  type="button"
                  className={`category-button shrink-0 snap-start px-3 py-1.5 rounded-full text-sm font-medium transition-all ${selectedTag === tag ? 'active bg-primary text-primary-foreground shadow-sm scale-105' : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:scale-105'}`}
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

function WhyChoose() {
  const features = [
    { icon: Zap, title: 'Fast Response', desc: 'Edge delivery keeps image requests quick and stable.', color: 'from-blue-500 to-cyan-400' },
    { icon: Shield, title: 'Stable Delivery', desc: 'Validation and deduplication keep responses predictable.', color: 'from-emerald-500 to-teal-400' },
    { icon: Tag, title: 'Flexible Tags', desc: 'Images can be organized by tag for random and targeted access.', color: 'from-indigo-500 to-violet-500' },
    { icon: Heart, title: 'Open Usage', desc: 'Works well for frontend pages, Markdown embeds, and scripts.', color: 'from-fuchsia-500 to-pink-500' },
  ];

  return (
    <section id="features" className="relative z-10 py-16 px-4 sm:px-6 scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <div className="section-header animate-slide-up">
          <h2>Why choose this API</h2>
          <p>Simple, fast, and reliable image delivery for websites and scripts.</p>
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

function LazySection({
  minHeight,
  children,
}: {
  minHeight: number;
  children: React.ReactNode;
}) {
  const [active, setActive] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || active) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setActive(true);
          observer.disconnect();
        }
      },
      { rootMargin: '320px 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [active]);

  return active ? (
    <Suspense fallback={<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-12"><div className="rounded-2xl skeleton-shimmer" style={{ height: `${minHeight}px` }} /></div>}>
      {children}
    </Suspense>
  ) : (
    <div ref={sentinelRef} className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <div className="rounded-2xl skeleton-shimmer" style={{ height: `${minHeight}px` }} />
    </div>
  );
}

export default function RandomPage() {
  const [shuffleTrigger, setShuffleTrigger] = useState(0);

  return (
    <>
      <HeroSection onShuffle={() => setShuffleTrigger(t => t + 1)} />
      <OnlinePreview shuffleTrigger={shuffleTrigger} />
      <WhyChoose />
      <LazySection minHeight={420}>
        <HomeStats />
      </LazySection>
      <LazySection minHeight={520}>
        <ApiDocsSection />
      </LazySection>
      <LazySection minHeight={620}>
        <HomeExtras />
      </LazySection>
    </>
  );
}
