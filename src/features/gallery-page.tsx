import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  Plus,
  Trash2,
  Edit3,
  Copy,
  Image,
  Loader2,
  Tag,
  Link,
  ChevronLeft,
  ChevronRight,
  Clock,
  RefreshCw,
  Search,
  KeyRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/utils';

interface ImageRecord {
  id: string;
  url: string;
  title: string;
  tags: string[];
  createdAt: string;
}

interface Stats {
  totalImages: number;
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

type ApiErrorPayload = {
  error?: string;
  message?: string;
};

type AdminAuthStatus = 'empty' | 'unverified' | 'checking' | 'valid' | 'invalid' | 'unconfigured';

const API_HTML_FALLBACK_MESSAGE = 'API returned HTML instead of JSON. Please check whether the Edge function is deployed correctly.';
const MAX_BATCH_IMAGE_COUNT = 500;
const GALLERY_PAGE_SIZE = 24;
const GALLERY_PAGE_SIZE_OPTIONS = [12, 24, 36, 60] as const;
const EDGEONE_PREVIEW_QUERY_KEYS = ['eo_token', 'eo_time'] as const;

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

async function copyText(text: string, successMessage = '瀹告彃顦查崚璺哄煂閸擃亣鍒涢弶?') {
  try {
    await copyToClipboard(text);
    toast.success(successMessage);
    return true;
  } catch (err) {
    toast.error(getErrorMessage(err, 'Copy failed. Please copy manually.'));
    return false;
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return '閺嗗倹妫ら弫鐗堝祦';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '閺冨爼妫块弮鐘虫櫏';

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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
    return `${fallback}閿涙碍甯撮崣锝堢箲閸ョ偘绨￠棃?JSON 閸愬懎顔愰敍?${summary}閿?`;
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
    throw new Error(`${fallback}: invalid JSON response`);
  }
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
      setUrl('');
      setTitle('');
      setTagsInput('');
      setBatchUrls('');
      setBatchTags('');
      setProgress({ current: 0, total: 0 });
    }
  }, [open]);

  const singleMutation = useMutation({
    mutationFn: () => createImage({ url: url.trim(), title: title.trim() || '閺堫亜鎳￠崥宥呮禈閻?', tags: parseTagsInput(tagsInput) }, adminToken),
    onSuccess: () => {
      toast.success('Image added successfully');
      setOpen(false);
      onSuccess();
    },
    onError: err => {
      toast.error(getErrorMessage(err, '濞ｈ濮炴径杈Е'));
    },
  });

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(await onRequireToken())) return;

    const lines = [...new Set(batchUrls.split('\n').map(line => line.trim()).filter(Boolean))];
    if (lines.length === 0) {
      toast.error('Please enter at least one image URL');
      return;
    }
    if (lines.length > MAX_BATCH_IMAGE_COUNT) {
      toast.error(`閸楁洘顐奸張鈧径姘潑閸?${MAX_BATCH_IMAGE_COUNT} 瀵姴娴橀悧?`);
      return;
    }

    const tags = parseTagsInput(batchTags);
    setProgress({ current: 0, total: lines.length });
    setLoading(true);

    try {
      const result = await batchCreateImages(
        lines.map((imageUrl, index) => ({ url: imageUrl, title: `閸ュ墽澧?${index + 1}`, tags })),
        adminToken,
      );
      setProgress({ current: result.success, total: lines.length });

      if (result.success > 0) {
        toast.success(`閹靛綊鍣哄ǎ璇插鐎瑰本鍨氶敍姘灇閸?${result.success} 瀵?${result.failed > 0 ? `閿涘苯銇戠拹?${result.failed} 瀵?` : ''}`);
        setOpen(false);
        onSuccess();
      } else {
        const firstError = result.results.find(item => !item.success)?.error;
        toast.error(firstError ? `Batch add failed: ${firstError}` : 'Batch add failed. Please check the URL format.');
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Batch add failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSingleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void (async () => {
      if (!(await onRequireToken())) return;

      if (!url.trim()) {
        toast.error('Please enter an image URL');
        return;
      }
      setLoading(true);
      singleMutation.mutate(undefined, { onSettled: () => setLoading(false) });
    })();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 gradient-button rounded-full border-0 text-white">
          <Plus className="w-4 h-4" />
          濞ｈ濮為崶鍓у
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-strong rounded-2xl sm:max-w-lg sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="w-5 h-5 text-blue-500" />
            濞ｈ濮炴径鏍懠閸ュ墽澧?          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 mt-2">
          <Button
            variant={mode === 'single' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('single')}
            className={`text-xs h-8 rounded-full ${mode === 'single' ? 'bg-primary text-primary-foreground' : ''}`}
          >
            閸楁洖绱跺ǎ璇插
          </Button>
          <Button
            variant={mode === 'batch' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('batch')}
            className={`text-xs h-8 rounded-full ${mode === 'batch' ? 'bg-primary text-primary-foreground' : ''}`}
          >
            閹靛綊鍣哄ǎ璇插
          </Button>
        </div>

        {mode === 'single' ? (
          <form onSubmit={handleSingleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="url">閸ュ墽澧栭崷鏉挎絻 *</Label>
              <Input id="url" className="rounded-lg bg-secondary/30 border-border/70" placeholder="https://example.com/image.jpg" value={url} onChange={e => setUrl(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" className="rounded-lg bg-secondary/30 border-border/70" placeholder="缂佹瑥娴橀悧鍥崳娑擃亜鎮曠€?" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma separated)</Label>
              <Input id="tags" className="rounded-lg bg-secondary/30 border-border/70" placeholder="landscape, nature, mountain" value={tagsInput} onChange={e => setTagsInput(e.target.value)} />
            </div>
            <Button type="submit" className="w-full gradient-button rounded-full border-0 text-white" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              濞ｈ濮?            </Button>
          </form>
        ) : (
          <form onSubmit={handleBatchSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="batch-urls">Image URLs (one per line)</Label>
              <textarea
                id="batch-urls"
                placeholder={'https://example.com/image1.jpg\nhttps://example.com/image2.jpg\nhttps://example.com/image3.jpg'}
                value={batchUrls}
                onChange={e => setBatchUrls(e.target.value)}
                required
                rows={6}
                className="w-full min-h-[140px] rounded-lg border border-border/70 bg-secondary/30 px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y font-mono"
              />
              <p className="text-xs text-muted-foreground">Duplicate URLs will be merged automatically. Up to {MAX_BATCH_IMAGE_COUNT} images per batch.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="batch-tags">缂佺喍绔撮弽鍥╊劮閿涘牓鈧褰块崚鍡涙閿涘苯褰查柅澶涚礆</Label>
              <Input id="batch-tags" className="rounded-lg bg-secondary/30 border-border/70" placeholder="landscape, nature" value={batchTags} onChange={e => setBatchTags(e.target.value)} />
              <p className="text-xs text-muted-foreground">These tags will be applied to every imported image.</p>
            </div>

            {loading && progress.total > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>濞ｈ濮炴潻娑樺</span>
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
              閹靛綊鍣哄ǎ璇插
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

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
    if (open) {
      setUrl(image.url);
      setTitle(image.title);
      setTagsInput(image.tags.join(', '));
    }
  }, [open, image]);

  const mutation = useMutation({
    mutationFn: () => updateImage(image.id, { url: url.trim(), title: title.trim(), tags: parseTagsInput(tagsInput) }, adminToken),
    onSuccess: () => {
      toast.success('Image updated successfully');
      setOpen(false);
      onSuccess();
    },
    onError: err => {
      toast.error(getErrorMessage(err, '閺囧瓨鏌婃径杈Е'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void (async () => {
      if (!(await onRequireToken())) return;

      if (!url.trim()) {
        toast.error('Please enter an image URL');
        return;
      }
      setLoading(true);
      mutation.mutate(undefined, { onSettled: () => setLoading(false) });
    })();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white/80 hover:text-white hover:bg-white/20" aria-label="缂傛牞绶崶鍓у">
          <Edit3 className="w-3.5 h-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-strong rounded-2xl sm:max-w-md sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-blue-500" />
            缂傛牞绶崶鍓у
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="edit-url">閸ュ墽澧栭崷鏉挎絻</Label>
            <Input id="edit-url" className="rounded-lg bg-secondary/30 border-border/70" value={url} onChange={e => setUrl(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-title">Title</Label>
            <Input id="edit-title" className="rounded-lg bg-secondary/30 border-border/70" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-tags">Tags</Label>
            <Input id="edit-tags" className="rounded-lg bg-secondary/30 border-border/70" value={tagsInput} onChange={e => setTagsInput(e.target.value)} />
          </div>
          <Button type="submit" className="w-full gradient-button rounded-full border-0 text-white" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            娣囨繂鐡?          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function GalleryPage() {
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
      toast.success('閸ュ墽澧栧鎻掑灩闂?');
      refreshGallery();
    },
    onError: err => {
      toast.error(getErrorMessage(err, '閸掔娀娅庢径杈Е'));
    },
  });

  const handleCopyUrl = async (url: string) => {
    await copyText(url, '閸ュ墽澧栭崷鏉挎絻瀹告彃顦查崚?');
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
    toast.success('缁狅紕鎮婄€靛棝鎸滃鍙夌闂?');
  };

  const checkAdminToken = useCallback(async (): Promise<boolean> => {
    const token = adminToken.trim();
    if (!token) {
      setAdminAuthStatus('empty');
      toast.error('Please enter the admin token first');
      return false;
    }

    setAdminAuthStatus('checking');
    try {
      await verifyAdminToken(token);
      setAdminAuthStatus('valid');
      toast.success('Admin token verified');
      return true;
    } catch (err) {
      const message = getErrorMessage(err, 'Admin token verification failed');
      if (message.includes('not configured')) {
        setAdminAuthStatus('unconfigured');
        toast.error('閺堝秴濮熺粩顖涙弓闁板秶鐤嗙粻锛勬倞鐎靛棝鎸滈敍宀冾嚞閸忓牆婀?EdgeOne Pages 閻滎垰顣ㄩ崣姗€鍣洪柊宥囩枂 ADMIN_TOKEN');
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
      toast.error('Please enter the admin token first');
      return false;
    }

    return checkAdminToken();
  }, [checkAdminToken, hasAdminToken, hasVerifiedAdminToken]);

  const adminStatusText = {
    empty: '閸欘亣顕板Ο鈥崇础',
    unverified: '瀵板懏鐗庢?',
    checking: '閺嶏繝鐛欐稉?',
    valid: '瀹告煡鐛欑拠?',
    invalid: '鐎靛棝鎸滈柨娆掝嚖',
    unconfigured: 'Server not configured',
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
          <p className="text-lg font-medium text-foreground">No images yet</p>
          <p className="text-sm mt-2 text-muted-foreground">{getErrorMessage(imagesQuery.error, '鐠囬鈼㈤崥搴ㄥ櫢鐠?')}</p>
          <Button className="mt-5" variant="outline" onClick={() => imagesQuery.refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            闁插秵鏌婇崝鐘烘祰
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-24 sm:py-28">
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">閸ュ墽澧栫粻锛勬倞</h2>
          <p className="text-muted-foreground text-sm mt-1">Manage your external image library here.</p>
        </div>
        <AddImageDialog adminToken={adminToken.trim()} onSuccess={refreshGallery} onRequireToken={requireAdminToken} />
      </div>

      <Card className="glass-strong rounded-2xl mb-5">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="admin-token" className="flex items-center gap-2 text-sm font-medium">
                <KeyRound className="h-4 w-4 text-blue-500" />
                缁狅紕鎮婄€靛棝鎸?              </Label>
              <Input
                id="admin-token"
                type="password"
                value={adminToken}
                onChange={event => handleAdminTokenChange(event.target.value)}
                placeholder="鏉堟挸鍙嗙粻锛勬倞鐎靛棝鎸滈崥搴㈠閼宠姤鍧婇崝鐘偓浣虹椽鏉堟垯鈧礁鍨归梽?"
                className="bg-secondary/30"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
                  閺嶏繝鐛?                </Button>
              )}
              {hasAdminToken && (
                <Button variant="outline" size="sm" onClick={clearAdminToken}>
                  濞撳懘娅?                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 mb-5 sm:grid-cols-3">
        {[
          { label: '閸ュ墽澧栭幀缁樻殶', value: totalImages, icon: Image },
          { label: '閺嶅洨顒烽弫浼村櫤', value: totalTags, icon: Tag },
          { label: '瑜版挸澧犳い鍨付閺?', value: latestImage ? formatDateTime(latestImage.createdAt) : '閺嗗倹妫ら弫鐗堝祦', icon: Clock },
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
                placeholder="閹兼粎鍌ㄩ弽鍥暯閵嗕箒RL 閹存牗鐖ｇ粵?"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={selectedTag === null ? 'default' : 'outline'}
                className={`max-w-full cursor-pointer ${
                  selectedTag === null ? 'bg-primary text-primary-foreground border-0' : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
                onClick={() => {
                  setSelectedTag(null);
                  setPage(1);
                }}
              >
                閸忋劑鍎?              </Badge>
              {tags.map(tag => (
                <Badge
                  key={tag}
                  variant={selectedTag === tag ? 'default' : 'outline'}
                  className={`max-w-full cursor-pointer ${
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
          <p className="text-lg font-medium text-foreground">閺嗗倹妫ら崶鍓у</p>
          <p className="text-sm mt-1">濞ｈ濮炵粭顑跨瀵姴顦婚柧鎯ф禈閻楀洤鎮楅崡鍐插讲瀵偓婵褰佹笟娑㈡閺堝搫娴橀幒銉ュ經</p>
          <div className="mt-5 flex justify-center">
            <AddImageDialog adminToken={adminToken.trim()} onSuccess={refreshGallery} onRequireToken={requireAdminToken} />
          </div>
        </div>
      )}

      {totalImages > 0 && filteredTotal === 0 && (
        <div className="rounded-2xl border border-dashed border-border glass px-6 py-14 text-center">
          <Search className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-base font-medium text-foreground">No matching images found</p>
          <p className="text-sm mt-1 text-muted-foreground">鐠嬪啯鏆ｉ幖婊呭偍鐠囧秵鍨ㄩ弽鍥╊劮缁涙盯鈧鎮楅崘宥堢槸</p>
          <Button variant="outline" className="mt-5" onClick={clearFilters}>Clear filters</Button>
        </div>
      )}

      {imagesQuery.isFetching && images.length > 0 && (
        <div className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/55 px-4 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          濮濓絽婀崝鐘烘祰瑜版挸澧犳い?
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
                          onClick={e => {
                            e.stopPropagation();
                            void handleCopyUrl(img.url);
                          }}
                          aria-label="Copy image URL"
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
                              aria-label="閸掔娀娅庨崶鍓у"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>绾喛顓婚崚鐘绘珟</AlertDialogTitle>
                              <AlertDialogDescription>Are you sure you want to delete &quot;{img.title}&quot;? This action cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={async () => {
                                  if (await requireAdminToken()) deleteMutation.mutate(img.id);
                                }}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                閸掔娀娅?                              </AlertDialogAction>
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
            <span>Total {filteredTotal}</span>
            <span>Per page {imagesQuery.data?.pageSize ?? pageSize}</span>
            <span>Page {page} / {totalPages}</span>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
            <div className="-mx-1 overflow-x-auto px-1 pb-1">
              <div className="flex min-w-max items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || imagesQuery.isFetching}
                  onClick={() => goToPage(1)}
                  aria-label="鐠哄疇娴嗛崚鎵儑娑撯偓妞?"
                >
                  妫ｆ牠銆?                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  disabled={page <= 1 || imagesQuery.isFetching}
                  onClick={() => goToPage(page - 1)}
                  aria-label="娑撳﹣绔存い?"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {visiblePages.map((pageNumber, index) => {
                  const previousPage = visiblePages[index - 1];
                  const hasGap = previousPage !== undefined && pageNumber - previousPage > 1;

                  return (
                    <div key={pageNumber} className="flex items-center gap-1">
                      {hasGap && <span className="flex h-9 w-6 items-center justify-center text-muted-foreground/70">...</span>}
                      <Button
                        variant={pageNumber === page ? 'default' : 'outline'}
                        size="icon"
                        className="h-9 w-9"
                        disabled={imagesQuery.isFetching}
                        onClick={() => goToPage(pageNumber)}
                        aria-current={pageNumber === page ? 'page' : undefined}
                        aria-label={`缁?${pageNumber} 妞?`}
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
                  aria-label="娑撳绔存い?"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || imagesQuery.isFetching}
                  onClick={() => goToPage(totalPages)}
                  aria-label="鐠哄疇娴嗛崚鐗堟付閸氬簼绔存い?"
                >
                  閺堫偊銆?                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <form onSubmit={handlePageJump} className="flex items-center gap-2">
                <Label htmlFor="gallery-page-jump" className="text-xs text-muted-foreground">
                  鐠哄疇鍤?                </Label>
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
                  鐠哄疇娴?                </Button>
              </form>
              <div className="flex items-center gap-2">
                <Label htmlFor="gallery-page-size" className="text-xs text-muted-foreground">
                  濮ｅ繘銆?                </Label>
                <Select value={String(pageSize)} onValueChange={value => setPageSize(Number(value))}>
                  <SelectTrigger id="gallery-page-size" className="h-9 w-24 bg-background/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GALLERY_PAGE_SIZE_OPTIONS.map(option => (
                      <SelectItem key={option} value={String(option)}>
                        {option} 瀵?
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
