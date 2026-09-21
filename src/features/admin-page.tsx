import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TagChip } from '@/components/ui/tag-chip';
import {
  Camera,
  Image,
  Loader2,
  Tag,
  Tags,
  ChevronLeft,
  ChevronRight,
  Search,
  KeyRound,
} from 'lucide-react';
import { toast } from 'sonner';

import type { Stats, PaginatedImages, AdminAuthStatus } from '@/lib/types';
import {
  MAX_SEARCH_LENGTH,
  GALLERY_PAGE_SIZE,
  GALLERY_PAGE_SIZE_OPTIONS,
} from '@/lib/constants';
import {
  fetchImagesPage,
  statsQueryOptions,
  verifyAdminToken,
  deleteImage,
} from '@/lib/api';
import {
  getErrorMessage,
  copyText,
  clampNumber,
  getVisiblePages,
} from '@/lib/helpers';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';

import { AddImageDialog } from './admin/add-image-dialog';
import { BatchUpdateTagsDialog } from './admin/batch-update-tags-dialog';
import { ImageCard } from './admin/image-card';

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
  // 批量标签的选择模式：勾选跨页保留（ids 与当前筛选无关），
  // 但筛选/翻页条件变化时清空，避免用户对着另一批图提交上一批的选择
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  // 密钥校验的请求序号：编辑/清除输入或再次点校验都会 +1，
  // 过期响应回来时序号对不上就作废，不把状态误写成「已验证」
  const tokenCheckSeqRef = useRef(0);
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

  const { data: stats } = useQuery<Stats>(statsQueryOptions());

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
    // 首页 hero 随机图与批量导入的去重快照都缓存着旧数据：删图后 hero 可能指向
    // 已不存在的地址，导入预览也会漏判。增删改后一并作废。
    queryClient.invalidateQueries({ queryKey: ['hero-image'] });
    queryClient.invalidateQueries({ queryKey: ['all-image-urls'] });
    // 「最新收录」区块与 hero 同族：同样缓存 /api/list 第一页、staleTime 5 分钟，
    // 漏掉它会让删掉的图在首页继续挂 5 分钟（裂图 + 灯箱 404），新图 5 分钟上不了榜。
    queryClient.invalidateQueries({ queryKey: ['gallery-preview'] });
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

  // 翻页/换每页数/改筛选后，网格换了一批图：静默保留旧勾选极易「以为选的是
  // 这批、实际提交的是上批」，条件一变就清空选择
  useEffect(() => {
    setSelectedIds((current) => (current.size === 0 ? current : new Set()));
  }, [page, pageSize, searchQuery, selectedTag]);

  useEffect(() => {
    if (imagesQuery.data && page > imagesQuery.data.totalPages) {
      setPage(imagesQuery.data.totalPages);
    }
  }, [imagesQuery.data, page]);

  useEffect(() => {
    setPageJumpInput(String(page));
  }, [page]);

  useEffect(() => {
    // 仅在拿到「本次请求」的真实数据时对齐页码。
    // placeholderData 会把上一页的数据留在 data 里（isPlaceholderData=true），
    // 此时 data.page 仍是旧页号，若据此回写会把刚翻到的页码弹回上一页。
    if (imagesQuery.isPlaceholderData) return;
    if (imagesQuery.data?.page && imagesQuery.data.page !== page) {
      setPage(imagesQuery.data.page);
    }
  }, [imagesQuery.data?.page, imagesQuery.isPlaceholderData, page]);

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
  // v5 的 mutate 引用稳定；单独解构出来才能直接当 ImageCard 的 memo prop
  const deleteImageById = deleteMutation.mutate;

  const handleCopyUrl = useCallback((url: string) => {
    void copyText(url, '图片地址已复制');
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

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

    // 越界输入必须把夹取后的结果回写输入框：goToPage 内部会夹到 [1,totalPages]，
    // 但输入框若停在用户敲的「999」，界面就自相矛盾（框里 999、实际在第 3 页）
    const clamped = clampNumber(nextPage, 1, totalPages);
    setPageJumpInput(String(clamped));
    goToPage(clamped);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedTag(null);
    setPage(1);
  };

  const handleAdminTokenChange = (value: string) => {
    setAdminToken(value);
    setAdminAuthStatus(value.trim() ? 'unverified' : 'empty');
    // 让在途的校验作废：否则旧密钥的响应回来后会把状态改回「已验证」，
    // 后续写操作会拿着未验证的新密钥直接打接口吃 401
    tokenCheckSeqRef.current += 1;
  };

  const clearAdminToken = () => {
    setAdminToken('');
    setAdminAuthStatus('empty');
    tokenCheckSeqRef.current += 1;
    toast.success('管理密钥已清除');
  };

  const checkAdminToken = useCallback(async (): Promise<boolean> => {
    const token = adminToken.trim();
    if (!token) {
      setAdminAuthStatus('empty');
      toast.error('请先填写管理密钥');
      return false;
    }

    const seq = ++tokenCheckSeqRef.current;
    const isStale = () => seq !== tokenCheckSeqRef.current;
    setAdminAuthStatus('checking');
    try {
      await verifyAdminToken(token);
      if (isStale()) return false;
      setAdminAuthStatus('valid');
      toast.success('管理密钥校验通过');
      return true;
    } catch (err) {
      if (isStale()) return false;
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
            <div className="h-3 w-20 rounded-lg skeleton-shimmer" />
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
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="section-eyebrow">
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
            管理后台
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">图片管理</h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
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
      <Card className="glass-strong mb-5 rounded-2xl">
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
                className="rounded-lg"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={hasVerifiedAdminToken ? 'default' : 'outline'}
                className={`rounded-full text-xs px-2.5 py-0.5 ${
                  hasVerifiedAdminToken
                    ? 'bg-success-ink text-white border-0 shadow-[2px_2px_0_0_var(--color-ink)]'
                    : adminAuthStatus === 'invalid'
                      ? 'bg-destructive-soft text-destructive-ink border-destructive-line'
                      : 'text-muted-foreground border-ink'
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
          <Card key={item.label} className="glass-strong rounded-2xl">
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
      <Card className="glass-strong mb-6 rounded-2xl">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" aria-hidden="true" />
              <Input
                value={searchTerm}
                maxLength={MAX_SEARCH_LENGTH}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                placeholder="搜索标题、URL 或标签"
                aria-label="搜索图片标题、URL 或标签"
                className="pl-9 rounded-lg"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <TagChip
                size="sm"
                active={selectedTag === null}
                onClick={() => {
                  setSelectedTag(null);
                  setPage(1);
                }}
              >
                全部
              </TagChip>
              {tags.map((tag) => (
                <TagChip
                  key={tag}
                  size="sm"
                  active={selectedTag === tag}
                  onClick={() => {
                    setSelectedTag(tag);
                    setPage(1);
                  }}
                >
                  {tag}
                </TagChip>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 批量标签工具条：非选择模式只有一个入口按钮，选择模式展开为操作条 */}
      {filteredTotal > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {!selectMode ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-xl text-xs"
              onClick={() => setSelectMode(true)}
            >
              <Tags className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              批量改标签
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-xl text-xs"
                onClick={() => {
                  // 「本页全选/取消」只在当前可见的图之间切换，勾选到一半时点击是清空本页
                  const pageIds = images.map((item) => item.id);
                  const allChecked = pageIds.every((id) => selectedIds.has(id));
                  setSelectedIds((current) => {
                    const next = new Set(current);
                    for (const id of pageIds) {
                      if (allChecked) next.delete(id);
                      else next.add(id);
                    }
                    return next;
                  });
                }}
              >
                {images.length > 0 && images.every((item) => selectedIds.has(item.id))
                  ? '取消本页'
                  : '本页全选'}
              </Button>
              <span className="text-xs text-muted-foreground">
                已选 <span className="font-bold text-foreground">{selectedIds.size}</span> 张
              </span>
              <BatchUpdateTagsDialog
                ids={[...selectedIds]}
                adminToken={adminToken.trim()}
                onSuccess={refreshGallery}
                onRequireToken={requireAdminToken}
              >
                <Button
                  variant="sticker"
                  size="sm"
                  className="h-8 rounded-xl text-xs"
                  disabled={selectedIds.size === 0}
                >
                  应用到 {selectedIds.size} 张
                </Button>
              </BatchUpdateTagsDialog>
              <Button variant="ghost" size="sm" className="h-8 rounded-xl text-xs" onClick={exitSelectMode}>
                完成
              </Button>
            </>
          )}
        </div>
      )}

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
        <div className="mb-4 flex items-center justify-center gap-2 rounded-xl border-2 border-ink bg-secondary px-4 py-2 text-sm text-muted-foreground">
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
            onCopyUrl={handleCopyUrl}
            onDelete={deleteImageById}
            onRefresh={refreshGallery}
            onRequireToken={requireAdminToken}
            isDeleting={deleteMutation.isPending && deleteMutation.variables === img.id}
            selectable={selectMode}
            selected={selectedIds.has(img.id)}
            onToggleSelect={toggleSelect}
          />
        ))}
      </div>

      {filteredTotal > 0 && (
        <div className="mt-8 flex flex-col gap-4 rounded-2xl border-2 border-ink bg-white px-4 py-3.5 text-sm text-muted-foreground shadow-[4px_4px_0_0_var(--color-ink)] lg:flex-row lg:items-center lg:justify-between">
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
                        <span className="flex h-8 w-6 items-center justify-center text-muted-foreground text-xs">
                          ···
                        </span>
                      )}
                      <Button
                        variant={pageNumber === page ? 'default' : 'outline'}
                        size="icon"
                        className={`h-8 w-8 rounded-xl text-xs ${pageNumber === page ? 'shadow-[2px_2px_0_0_var(--color-ink)]' : ''}`}
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
                  className="h-8 w-18 bg-secondary text-center rounded-lg text-sm"
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
                    className="h-8 w-22 bg-secondary rounded-lg text-xs"
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
