import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Search,
  KeyRound,
} from 'lucide-react';
import { toast } from 'sonner';

import type { ImageRecord, Stats, PaginatedImages, AdminAuthStatus, LazyImageState } from '@/lib/types';
import { MAX_BATCH_IMAGE_COUNT, GALLERY_PAGE_SIZE, GALLERY_PAGE_SIZE_OPTIONS } from '@/lib/constants';
import {
  fetchImagesPage,
  fetchStats,
  fetchExistingImageUrlSet,
  verifyAdminToken,
  createImage,
  updateImage,
  deleteImage,
  batchCreateImages,
} from '@/lib/api';
import {
  getErrorMessage,
  copyText,
  parseTagsInput,
  parseBatchUrls,
  clampNumber,
  getVisiblePages,
} from '@/lib/helpers';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';

// ============================================================
// Hooks
// ============================================================

// useDebouncedValue 已提取到 @/hooks/use-debounced-value —— 图库浏览页也要用同一份实现

/**
 * useLazyImage — IntersectionObserver-based lazy loading hook.
 */
function useLazyImage(src: string, eager = false): {
  containerRef: React.RefObject<HTMLDivElement | null>;
  activeSrc: string | undefined;
  state: LazyImageState;
  onLoad: () => void;
  onError: () => void;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<LazyImageState>(eager ? 'loading' : 'idle');

  const activeSrc = state !== 'idle' ? src : undefined;

  useEffect(() => {
    if (eager) return;
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setState('loading');
          observer.disconnect();
        }
      },
      { rootMargin: '400px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [eager]);

  const onLoad = useCallback(() => setState('loaded'), []);
  const onError = useCallback(() => setState('error'), []);

  return { containerRef, activeSrc, state, onLoad, onError };
}

// ============================================================
// Add Image Dialog
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
  const [batchFailures, setBatchFailures] = useState<Array<{ url: string; error?: string }>>([]);

  // Existing gallery URLs for pre-submit dedup. Cheap: gallery is small (<500).
  const existingUrlsQuery = useQuery<Set<string>>({
    queryKey: ['all-image-urls'],
    queryFn: fetchExistingImageUrlSet,
    enabled: open && mode === 'batch',
    staleTime: 30_000,
  });

  const batchPreview = useMemo(
    () => parseBatchUrls(batchUrls, existingUrlsQuery.data),
    [batchUrls, existingUrlsQuery.data],
  );

  useEffect(() => {
    if (open) {
      setMode('single');
      setUrl('');
      setTitle('');
      setTagsInput('');
      setBatchUrls('');
      setBatchTags('');
      setProgress({ current: 0, total: 0 });
      setBatchFailures([]);
    }
  }, [open]);

  const singleMutation = useMutation({
    mutationFn: () =>
      createImage({ url: url.trim(), title: title.trim() || '未命名图片', tags: parseTagsInput(tagsInput) }, adminToken),
    onSuccess: () => {
      toast.success('Image added successfully');
      setOpen(false);
      onSuccess();
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, '添加失败'));
    },
  });

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(await onRequireToken())) return;

    const cleanUrls = batchPreview.validNew;
    if (batchPreview.invalid.length > 0) {
      toast.error(`有 ${batchPreview.invalid.length} 行不是有效的 http(s) 地址，请先删掉标红的行`);
      return;
    }
    if (cleanUrls.length === 0) {
      if (batchPreview.duplicatesInBatch.length > 0 || batchPreview.alreadyExists.length > 0) {
        toast.error('没有可导入的新地址：本次粘贴全是重复或库里已有的 URL');
      } else {
        toast.error('Please enter at least one image URL');
      }
      return;
    }
    if (cleanUrls.length > MAX_BATCH_IMAGE_COUNT) {
      toast.error(`单次最多添加 ${MAX_BATCH_IMAGE_COUNT} 张图片，当前可导入 ${cleanUrls.length} 张`);
      return;
    }

    const tags = parseTagsInput(batchTags);
    setProgress({ current: 0, total: cleanUrls.length });
    setBatchFailures([]);
    setLoading(true);

    try {
      const result = await batchCreateImages(
        cleanUrls.map((imageUrl, index) => ({ url: imageUrl, title: `图片 ${index + 1}`, tags })),
        adminToken,
      );
      setProgress({ current: result.success, total: cleanUrls.length });
      const failures = result.results
        .filter((item) => !item.success)
        .map((item) => ({ url: item.url, error: item.error }));
      setBatchFailures(failures);

      if (result.success > 0) {
        toast.success(
          `批量添加完成：成功 ${result.success} 张${result.failed > 0 ? `，失败 ${result.failed} 张` : ''}`,
        );
        if (result.failed === 0) {
          setOpen(false);
        }
        onSuccess();
      } else {
        const firstError = result.results.find((item) => !item.success)?.error;
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
          <Plus className="w-4 h-4" aria-hidden="true" />
          添加图片
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-strong rounded-2xl sm:max-w-xl sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="w-5 h-5 text-brand-500" aria-hidden="true" />
            添加外链图片
          </DialogTitle>
        </DialogHeader>

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
              <Input
                id="url"
                className="rounded-lg bg-secondary/30 border-border/70"
                placeholder="https://example.com/image.jpg"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">标题</Label>
              <Input
                id="title"
                className="rounded-lg bg-secondary/30 border-border/70"
                placeholder="给图片起个名字"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">标签（逗号分隔）</Label>
              <Input
                id="tags"
                className="rounded-lg bg-secondary/30 border-border/70"
                placeholder="风景, 自然, 山脉"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full gradient-button rounded-full border-0 text-white" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" /> : <Plus className="w-4 h-4 mr-2" aria-hidden="true" />}
              添加
            </Button>
          </form>
        ) : (
          <form onSubmit={handleBatchSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="batch-urls">图片地址（每行一个，也支持空格/逗号分隔）*</Label>
              <textarea
                id="batch-urls"
                placeholder={
                  'https://example.com/image1.jpg\nhttps://example.com/image2.jpg\nhttps://example.com/image3.jpg'
                }
                value={batchUrls}
                onChange={(e) => {
                  setBatchUrls(e.target.value);
                  setBatchFailures([]);
                }}
                required
                rows={6}
                className="w-full min-h-[140px] rounded-lg border border-border/70 bg-secondary/30 px-3 py-2 text-sm placeholder:text-muted-foreground resize-y font-mono"
              />
              <p className="text-xs text-muted-foreground">
                粘贴后自动归一化并预检，单次最多 {MAX_BATCH_IMAGE_COUNT} 张
                {existingUrlsQuery.isLoading ? '（正在读取库内地址…）' : ''}
              </p>
            </div>

            {batchUrls.trim() && (
              <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <Badge className="rounded-full bg-emerald-50 text-emerald-700 border-emerald-200">
                    可导入 {batchPreview.validNew.length}
                  </Badge>
                  {batchPreview.duplicatesInBatch.length > 0 && (
                    <Badge className="rounded-full bg-amber-50 text-amber-700 border-amber-200">
                      本次重复 {batchPreview.duplicatesInBatch.length}
                    </Badge>
                  )}
                  {batchPreview.alreadyExists.length > 0 && (
                    <Badge variant="outline" className="rounded-full text-muted-foreground">
                      库里已有 {batchPreview.alreadyExists.length}
                    </Badge>
                  )}
                  {batchPreview.invalid.length > 0 && (
                    <Badge className="rounded-full bg-red-50 text-red-600 border-red-200">
                      无效 {batchPreview.invalid.length}
                    </Badge>
                  )}
                </div>

                {batchPreview.invalid.length > 0 && (
                  <div className="mt-2 max-h-20 overflow-y-auto rounded-lg bg-red-50/60 p-2 font-mono text-[11px] text-red-600">
                    {batchPreview.invalid.slice(0, 10).map((line) => (
                      <div key={line} className="truncate">
                        ✕ {line}
                      </div>
                    ))}
                    {batchPreview.invalid.length > 10 && (
                      <div>…等 {batchPreview.invalid.length} 行</div>
                    )}
                  </div>
                )}

                {(batchPreview.duplicatesInBatch.length > 0 ||
                  batchPreview.alreadyExists.length > 0) && (
                  <div className="mt-2 max-h-20 overflow-y-auto rounded-lg bg-secondary/40 p-2 font-mono text-[11px] text-muted-foreground">
                    {batchPreview.duplicatesInBatch.slice(0, 5).map((line) => (
                      <div key={`dup-${line}`} className="truncate">
                        本次重复：{line}
                      </div>
                    ))}
                    {batchPreview.alreadyExists.slice(0, 5).map((line) => (
                      <div key={`exists-${line}`} className="truncate">
                        库里已有：{line}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="batch-tags">统一标签（逗号分隔，可选）</Label>
              <Input
                id="batch-tags"
                className="rounded-lg bg-secondary/30 border-border/70"
                placeholder="风景, 自然"
                value={batchTags}
                onChange={(e) => setBatchTags(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">所有图片将使用相同的标签</p>
            </div>

            {batchFailures.length > 0 && (
              <div className="max-h-28 overflow-y-auto rounded-xl border border-red-200 bg-red-50/60 p-2.5 text-xs text-red-600">
                <p className="mb-1 font-semibold">以下 {batchFailures.length} 条未导入：</p>
                {batchFailures.slice(0, 10).map((item) => (
                  <div key={item.url} className="truncate font-mono text-[11px]">
                    {item.url} — {item.error ?? '失败'}
                  </div>
                ))}
              </div>
            )}

            {loading && progress.total > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>添加进度</span>
                  <span>
                    {progress.current} / {progress.total}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-brand-500 to-iris-500 rounded-full transition-all duration-300"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <Button
              type="submit"
              className="w-full gradient-button rounded-full border-0 text-white"
              disabled={loading || batchPreview.validNew.length === 0}
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" /> : <Plus className="w-4 h-4 mr-2" aria-hidden="true" />}
              {batchPreview.validNew.length > 0
                ? `只导入全新 ${batchPreview.validNew.length} 张`
                : '批量添加'}
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
    if (open) {
      setUrl(image.url);
      setTitle(image.title);
      setTagsInput(image.tags.join(', '));
    }
  }, [open, image]);

  const mutation = useMutation({
    mutationFn: () =>
      updateImage(image.id, { url: url.trim(), title: title.trim(), tags: parseTagsInput(tagsInput) }, adminToken),
    onSuccess: () => {
      toast.success('Image updated successfully');
      setOpen(false);
      onSuccess();
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, '更新失败'));
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
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-white/80 hover:text-white hover:bg-white/20"
          aria-label="编辑图片"
        >
          <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-strong rounded-2xl sm:max-w-md sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-brand-500" aria-hidden="true" />
            编辑图片
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="edit-url">图片地址</Label>
            <Input
              id="edit-url"
              className="rounded-lg bg-secondary/30 border-border/70"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-title">标题</Label>
            <Input
              id="edit-title"
              className="rounded-lg bg-secondary/30 border-border/70"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-tags">标签</Label>
            <Input
              id="edit-tags"
              className="rounded-lg bg-secondary/30 border-border/70"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full gradient-button rounded-full border-0 text-white" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" /> : null}
            保存
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Image Card
// ============================================================

function ImageCard({
  img,
  index,
  adminToken,
  onCopyUrl,
  onDelete,
  onRefresh,
  onRequireToken,
  isDeleting,
}: {
  img: ImageRecord;
  index: number;
  adminToken: string;
  onCopyUrl: (url: string) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
  onRequireToken: () => Promise<boolean>;
  isDeleting: boolean;
}) {
  const eager = index < 6;
  const { containerRef, activeSrc, state, onLoad, onError } = useLazyImage(img.url, eager);

  return (
    <Card
      className="group overflow-hidden glass-card rounded-2xl border-white/60 animate-fade-in"
      style={{ animationDelay: `${Math.min(index, 12) * 0.04}s` }}
    >
      <CardContent className="p-0">
        <div ref={containerRef as React.RefObject<HTMLDivElement>} className="relative aspect-video overflow-hidden bg-muted/50">
          {state !== 'loaded' && state !== 'error' && (
            <div className="absolute inset-0 skeleton-shimmer" aria-hidden="true" />
          )}

          {state === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/40 text-muted-foreground/50">
              <Image className="w-8 h-8 opacity-40" aria-hidden="true" />
              <span className="text-xs">加载失败</span>
            </div>
          )}

          {activeSrc && (
            <img
              src={activeSrc}
              alt={img.title}
              className={`w-full h-full object-cover transition-all duration-500 motion-safe:group-hover:scale-108 ${
                state === 'loaded' ? 'opacity-100' : 'opacity-0'
              }`}
              style={{ willChange: 'transform' }}
              decoding="async"
              onLoad={onLoad}
              onError={onError}
            />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 sm:group-hover:opacity-100 transition-opacity duration-300" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent sm:hidden" />

          <div className="absolute inset-x-0 bottom-0 p-3.5 translate-y-1 sm:translate-y-2 sm:group-hover:translate-y-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300">
            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h4 className="text-white font-semibold text-sm truncate leading-snug">{img.title}</h4>
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {img.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[11px] bg-white/15 backdrop-blur-sm text-white/85 px-1.5 py-0.5 rounded-full border border-white/10"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  variant="secondary"
                  size="icon"
                  className="w-7 h-7 rounded-lg bg-white/18 hover:bg-white/28 text-white border-0 backdrop-blur-sm transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCopyUrl(img.url);
                  }}
                  aria-label="复制图片地址"
                >
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                </Button>
                <EditImageDialog
                  image={img}
                  adminToken={adminToken}
                  onSuccess={onRefresh}
                  onRequireToken={onRequireToken}
                />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="icon"
                      className="w-7 h-7 rounded-lg bg-red-500/28 hover:bg-red-500/50 text-white border-0 backdrop-blur-sm transition-colors"
                      aria-label="删除图片"
                      disabled={isDeleting}
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="glass-strong rounded-2xl border-white/60">
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认删除</AlertDialogTitle>
                      <AlertDialogDescription>
                        确定要删除「{img.title}」吗？此操作不可撤销。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="rounded-xl">取消</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          if (await onRequireToken()) onDelete(img.id);
                        }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
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
      </CardContent>
    </Card>
  );
}

// ============================================================
// Gallery Page
// ============================================================

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
    queryFn: () =>
      fetchImagesPage({
        page,
        pageSize,
        search: searchQuery,
        tag: selectedTag,
      }),
    placeholderData: (previousData) => previousData,
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 15_000,
    staleTime: 15_000,
  });

  const images = imagesQuery.data?.items ?? [];
  const totalImages = stats?.totalImages ?? imagesQuery.data?.total ?? 0;
  const totalPages = imagesQuery.data?.totalPages ?? 1;
  const filteredTotal = imagesQuery.data?.total ?? 0;
  const tags = stats?.tags ?? [];
  const totalTags = tags.length;
  const visiblePages = useMemo(() => getVisiblePages(page, totalPages), [page, totalPages]);
  const isInitialLoading = imagesQuery.isLoading && !imagesQuery.data;

  const refreshGallery = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['images'] });
    queryClient.invalidateQueries({ queryKey: ['stats'], refetchType: 'all' });
  }, [queryClient]);

  const prefetchGalleryPage = useCallback(
    (nextPage: number) => {
      if (nextPage < 1 || nextPage > totalPages) return;
      queryClient.prefetchQuery({
        queryKey: ['images', { page: nextPage, pageSize, search: searchQuery, tag: selectedTag }],
        queryFn: () =>
          fetchImagesPage({
            page: nextPage,
            pageSize,
            search: searchQuery,
            tag: selectedTag,
          }),
        staleTime: 10_000,
      });
    },
    [pageSize, queryClient, searchQuery, selectedTag, totalPages],
  );

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

  const goToPage = useCallback(
    (nextPage: number) => {
      setPage(clampNumber(nextPage, 1, totalPages));
    },
    [totalPages],
  );

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
      toast.error('Please enter the admin token first');
      return false;
    }

    return checkAdminToken();
  }, [checkAdminToken, hasAdminToken, hasVerifiedAdminToken]);

  const adminStatusText =
    {
      empty: '只读模式',
      unverified: '待校验',
      checking: '校验中',
      valid: '已验证',
      invalid: '密钥错误',
      unconfigured: '服务端未配置',
    }[adminAuthStatus];

  if (isInitialLoading) {
    return (
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-[calc(var(--header-h)+32px)] pb-24 sm:pb-28">
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
      <div className="relative z-10 max-w-6xl mx-auto px-4 pt-[calc(var(--header-h)+32px)] pb-28 sm:px-6">
        <ErrorState
          title="图库加载失败"
          message={getErrorMessage(imagesQuery.error, '请稍后重试')}
          onRetry={() => imagesQuery.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-[calc(var(--header-h)+32px)] pb-24 sm:pb-28">
      {/* Page Header */}
      <div className="flex flex-col gap-4 mb-7 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">图片管理</h1>
          <p className="text-muted-foreground text-sm mt-1.5">
            管理你的外链图片库 · 支持批量导入与搜索
          </p>
        </div>
        <AddImageDialog
          adminToken={adminToken.trim()}
          onSuccess={refreshGallery}
          onRequireToken={requireAdminToken}
        />
      </div>

      {/* Admin Token Card */}
      <Card className="glass-strong rounded-2xl mb-5 border-white/60">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <Label
                htmlFor="admin-token"
                className="flex items-center gap-2 text-sm font-semibold"
              >
                <div className="w-6 h-6 rounded-lg bg-brand-50 flex items-center justify-center">
                  <KeyRound className="h-3.5 w-3.5 text-brand-500" aria-hidden="true" />
                </div>
                管理密钥
              </Label>
              <Input
                id="admin-token"
                type="password"
                value={adminToken}
                onChange={(event) => handleAdminTokenChange(event.target.value)}
                placeholder="输入管理密钥后才能添加、编辑、删除"
                className="bg-secondary/30 rounded-xl"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={hasVerifiedAdminToken ? 'default' : 'outline'}
                className={`rounded-full text-xs px-2.5 py-0.5 ${
                  hasVerifiedAdminToken
                    ? 'bg-emerald-600 text-white border-0 shadow-sm'
                    : adminAuthStatus === 'invalid'
                      ? 'bg-red-50 text-red-600 border-red-100'
                      : 'text-muted-foreground border-border'
                }`}
              >
                {adminAuthStatus === 'checking' && (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
                )}
                {adminStatusText}
              </Badge>
              {hasAdminToken && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl h-8 text-xs"
                  onClick={() => void checkAdminToken()}
                  disabled={adminAuthStatus === 'checking'}
                >
                  {adminAuthStatus === 'checking' ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <KeyRound className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  校验
                </Button>
              )}
              {hasAdminToken && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl h-8 text-xs"
                  onClick={clearAdminToken}
                >
                  清除
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          {
            label: '图片总数',
            value: totalImages,
            icon: Image,
            color: 'text-brand-500',
            bg: 'bg-brand-50',
          },
          {
            label: '标签数量',
            value: totalTags,
            icon: Tag,
            color: 'text-iris-500',
            bg: 'bg-iris-50',
          },
          {
            label: '本页 / 筛选',
            value: `${images.length} / ${filteredTotal}`,
            icon: Search,
            color: 'text-brand-500',
            bg: 'bg-brand-50',
          },
        ].map((item) => (
          <Card key={item.label} className="glass-strong rounded-2xl border-white/60">
            <CardContent className="p-3.5 sm:p-4 flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-xl ${item.bg} flex items-center justify-center shrink-0`}
              >
                <item.icon className={`w-4.5 h-4.5 ${item.color}`} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="truncate text-base sm:text-lg font-bold text-foreground">
                  {item.value}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search & Filter Card */}
      <Card className="glass-strong rounded-2xl mb-6 border-white/60">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" aria-hidden="true" />
              <Input
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                placeholder="搜索标题、URL 或标签"
                className="pl-9 rounded-xl bg-secondary/30"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                className={`category-button cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  selectedTag === null
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'border border-border bg-white/70 text-muted-foreground hover:bg-white hover:text-foreground'
                }`}
                onClick={() => {
                  setSelectedTag(null);
                  setPage(1);
                }}
              >
                全部
              </button>
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`category-button cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                    selectedTag === tag
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : 'border border-border bg-white/70 text-muted-foreground hover:bg-white hover:text-foreground'
                  }`}
                  onClick={() => {
                    setSelectedTag(tag);
                    setPage(1);
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {totalImages === 0 && (
        <EmptyState
          icon={Camera}
          title="图片库还是空的"
          message="添加第一张图片，开始建设你的共享图库。"
        >
          <AddImageDialog
            adminToken={adminToken.trim()}
            onSuccess={refreshGallery}
            onRequireToken={requireAdminToken}
          />
        </EmptyState>
      )}

      {totalImages > 0 && filteredTotal === 0 && (
        <EmptyState
          icon={Search}
          title="没有找到匹配的图片"
          message="换个关键词试试，或者清空当前筛选条件。"
        >
          <Button variant="outline" onClick={clearFilters}>
            清空筛选
          </Button>
        </EmptyState>
      )}

      {imagesQuery.isFetching && images.length > 0 && (
        <div className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/55 px-4 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          正在刷新图库数据...
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {images.map((img, index) => (
          <ImageCard
            key={img.id}
            img={img}
            index={index}
            adminToken={adminToken.trim()}
            onCopyUrl={(url) => void handleCopyUrl(url)}
            onDelete={(id) => deleteMutation.mutate(id)}
            onRefresh={refreshGallery}
            onRequireToken={requireAdminToken}
            isDeleting={deleteMutation.isPending} aria-hidden="true" />
        ))}
      </div>

      {filteredTotal > 0 && (
        <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-border/50 bg-background/60 glass px-4 py-3.5 text-sm text-muted-foreground lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="font-medium text-foreground/70">
              共 <span className="text-foreground font-bold">{filteredTotal}</span> 张
            </span>
            <span>每页 {imagesQuery.data?.pageSize ?? pageSize} 张</span>
            <span>
              第 {page} / {totalPages} 页
            </span>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
            <div className="-mx-1 overflow-x-auto px-1 pb-1">
              <div className="flex min-w-max items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs h-8 px-3"
                  disabled={page <= 1 || imagesQuery.isFetching}
                  onClick={() => goToPage(1)}
                  aria-label="跳转到第一页"
                >
                  首页
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-xl"
                  disabled={page <= 1 || imagesQuery.isFetching}
                  onClick={() => goToPage(page - 1)}
                  aria-label="上一页"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                {visiblePages.map((pageNumber, index) => {
                  const previousPage = visiblePages[index - 1];
                  const hasGap = previousPage !== undefined && pageNumber - previousPage > 1;

                  return (
                    <div key={pageNumber} className="flex items-center gap-1">
                      {hasGap && (
                        <span className="flex h-8 w-6 items-center justify-center text-muted-foreground/50 text-xs">
                          ···
                        </span>
                      )}
                      <Button
                        variant={pageNumber === page ? 'default' : 'outline'}
                        size="icon"
                        className={`h-8 w-8 rounded-xl text-xs ${pageNumber === page ? 'shadow-sm' : ''}`}
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
                  className="h-8 w-8 rounded-xl"
                  disabled={page >= totalPages || imagesQuery.isFetching}
                  onClick={() => goToPage(page + 1)}
                  aria-label="下一页"
                >
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs h-8 px-3"
                  disabled={page >= totalPages || imagesQuery.isFetching}
                  onClick={() => goToPage(totalPages)}
                  aria-label="跳转到最后一页"
                >
                  末页
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <form onSubmit={handlePageJump} className="flex items-center gap-2">
                <Label
                  htmlFor="gallery-page-jump"
                  className="text-xs text-muted-foreground shrink-0"
                >
                  跳转
                </Label>
                <Input
                  id="gallery-page-jump"
                  type="number"
                  min={1}
                  max={totalPages}
                  value={pageJumpInput}
                  onChange={(event) => setPageJumpInput(event.target.value)}
                  className="h-8 w-18 bg-background/60 text-center rounded-xl text-sm"
                  disabled={imagesQuery.isFetching}
                />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-xl text-xs"
                  disabled={imagesQuery.isFetching}
                >
                  前往
                </Button>
              </form>
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="gallery-page-size"
                  className="text-xs text-muted-foreground shrink-0"
                >
                  每页
                </Label>
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) => setPageSize(Number(value))}
                >
                  <SelectTrigger
                    id="gallery-page-size"
                    className="h-8 w-22 bg-background/60 rounded-xl text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GALLERY_PAGE_SIZE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option} 张
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
