import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery, keepPreviousData } from '@tanstack/react-query';
import { Check, Images, Link2, Loader2, Search, SearchX, Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MasonryTile, SKELETON_RATIOS } from '@/components/ui/masonry-tile';
import { ImageLightbox } from '@/components/ui/image-lightbox';
import { TagChip } from '@/components/ui/tag-chip';
import type { PaginatedImages, Stats } from '@/lib/types';
import { MAX_SEARCH_LENGTH } from '@/lib/constants';
import { fetchImagesPage, statsQueryOptions } from '@/lib/api';
import { getErrorMessage } from '@/lib/helpers';
import { stripControlChars } from '@/lib/text';
import { useCopyFeedback } from '@/hooks/use-copy-feedback';
import { readGalleryQuery, writeGalleryQuery } from '@/lib/url';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';

/** 后端 MAX_LIST_PAGE_SIZE = 60，这里取默认值 24，保证翻页粒度舒服 */
const BROWSE_PAGE_SIZE = 24;

export default function GalleryBrowse() {
  // 首帧直接从地址栏取初值，避免「先渲染整库、再跳成筛选结果」的闪动
  const [{ search: initialSearch, tag: initialTag }] = useState(() =>
    readGalleryQuery(window.location.search),
  );
  const [selectedTag, setSelectedTag] = useState<string | null>(initialTag);
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);
  // 剔控制字符再 trim：用户 Ctrl+V 粘贴进来的 NUL 等是不可见的，
  // 只 trim 会出现「输入框看着是空的、页面却一直在筛选」的假空结果态。
  const searchQuery = stripControlChars(debouncedSearchTerm).trim();

  // 筛选状态回写地址栏。用 replaceState 而不是 pushState：
  // 否则每敲一个字都会往历史里塞一条记录，后退键会变成「逐字回退」。
  useEffect(() => {
    const current = window.location.search.replace(/^\?/, '');
    const next = writeGalleryQuery(current, { search: searchQuery, tag: selectedTag });
    if (next === current) return;

    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${next ? `?${next}` : ''}${window.location.hash}`,
    );
  }, [searchQuery, selectedTag]);

  // 前进/后退回到带参数的图库地址时，把筛选状态同步回来
  useEffect(() => {
    const onPopState = () => {
      const { search, tag } = readGalleryQuery(window.location.search);
      setSearchTerm(search);
      setSelectedTag(tag);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const { data: stats } = useQuery<Stats>(statsQueryOptions());

  const imagesQuery = useInfiniteQuery<PaginatedImages>({
    queryKey: ['gallery-browse', { tag: selectedTag, search: searchQuery }],
    queryFn: ({ pageParam }) =>
      fetchImagesPage({
        page: pageParam as number,
        pageSize: BROWSE_PAGE_SIZE,
        search: searchQuery,
        tag: selectedTag,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.page + 1 : undefined),
    // 切换标签/搜索时保留上一批，避免整块闪白
    placeholderData: keepPreviousData,
  });

  /**
   * 合并所有已加载页，并按 id 去重（保留首次出现）。
   *
   * 为什么必须去重：分页是 offset 式的（服务端按 start/start+pageSize 切片全量数组），
   * 而「加载更多」是两次独立的请求。两次请求之间图库只要多了一张图（管理员导入、
   * 或别的管理员刚加完），整个数组就右移一位 —— 第 2 页会把第 1 页末尾几张**再发一遍**。
   *
   * 实测（桩：第 1 页返回 1..12、第 2 页返回 10..21，模拟中间插入了新图）：
   * 未去重时页面出现 24 张瓦片但只有 21 个唯一地址，img-10 / img-11 / img-12 各渲染两次，
   * 用户看到重复图片。React 不会因此报错（key 由 MasonryTile 内部生成），所以
   * 这类重复不会有任何控制台信号 —— 只能靠去重挡住。
   *
   * 去重放在这一层（合页之后）而不是依赖服务端，是因为 offset 分页的重叠是分页模型本身
   * 的固有性质，服务端无状态、无从知道客户端已经拿过哪些。换 cursor 分页能根治，但那是
   * 更大的改动；这里按「同一个 id = 同一张图」收敛，代价是一次 O(n) 扫描。
   */
  const images = useMemo(() => {
    const merged = imagesQuery.data?.pages.flatMap((page) => page.items) ?? [];
    const seen = new Set<string>();
    return merged.filter((image) => {
      if (seen.has(image.id)) return false;
      seen.add(image.id);
      return true;
    });
  }, [imagesQuery.data]);
  /**
   * 头部「共 N 张」。
   *
   * 必须取**最后一页**的 total，不能用 pages[0] —— pages[0] 是第一次请求的快照，
   * 只要图库在浏览期间被改动（管理员导入或删除，与上面去重挡的是同一个竞态），
   * 后面的翻页会带回新的 total，头部却仍钉在旧值上。实测（pageSize 24、只要
   * hasNextPage 就继续翻）：首访 30 张、翻到第 2 页时图库已被导入到 50，页面渲染
   * 50 张瓦片，头部却写「共 30 张」，而同屏页脚写着「已经到底了 · 共 50 张」——
   * 两个「共 N 张」自相矛盾，且没有任何报错信号。
   */
  const total =
    imagesQuery.data?.pages[imagesQuery.data.pages.length - 1]?.total ?? 0;
  const tags = stats?.tags ?? [];
  const isInitialLoading = imagesQuery.isLoading && !imagesQuery.data;
  const isEmpty = !isInitialLoading && images.length === 0;

  // 「整块错误态」只服务首屏失败。续加载失败时 isError 同样是 true，
  // 但那时用户已经看到了一批图 —— 实测（第 1 页正常、第 2 页恒 500）：
  // 点「加载更多」失败后，24 张瓦片被整块替换成「图库加载失败」，
  // 已浏览的内容全丢，只能重新加载。所以这里按 hasData 区分：
  // 有数据时失败只在「加载更多」附近就地提示，不动已渲染的网格。
  const isInitialError = imagesQuery.isError && images.length === 0;
  const hasFilter = Boolean(selectedTag) || searchQuery.length > 0;
  const hasNextPage = Boolean(imagesQuery.hasNextPage);
  const fetchNextPage = imagesQuery.fetchNextPage;

  // 续加载（翻到末尾自动拉下一页）失败时要能告知灯箱 —— 否则它会停在
  // 「正在加载下一张…」，而 hasNextPage 失败后仍为 true，越界处理不会收弹窗。
  const nextPageFailed = imagesQuery.isFetchNextPageError;

  // 筛选条件（标签/搜索词）一变就收起灯箱。
  // 理由：`placeholderData: keepPreviousData` 会在切筛选的瞬间把旧一批结果
  // 继续留在 `images` 里，此时旧索引仍「合法」，灯箱不会自动关。等新数据
  // 一到，同一个索引就指向了完全不同的另一张图（甚至越界）——用户视角是
  // 「切了个标签，大图莫名换了一张」。索引的语义只对当前这份结果集成立，
  // 结果集换了，索引就该作废。
  useEffect(() => {
    setLightboxIndex(null);
  }, [selectedTag, searchQuery]);

  // 灯箱索引越界处理。
  //
  // 索引可以临时等于 `images.length`：那是「已请求下一页、数据还在路上」的占位。
  // 但这个占位**必须有解除条件**，否则灯箱会永久停在「正在加载下一张…」。
  //
  // 实测踩到的死锁（P171 引入前端去重之后）：
  //   服务端第 2 页整页都是第 1 页已有的项（offset 分页在两次请求之间被插入新图时的极端形态）。
  //   去重后 `images` 长度不变，而 hasNextPage 仍为 true —— 原先的判据
  //   「越界 && hasNextPage && index === length」永远成立，占位态永不解除。
  //   实测：连按 8 次「下一张」后弹窗文字停在「正在加载下一张（已显示 6 张）」，
  //   瓦片数始终 6，弹窗不关 —— 用户只能手动关掉。
  //
  // 现在按三种情况分开：
  //   · 确实在拉下一页        → 保留占位（原有行为）
  //   · 拉失败（待用户重试）  → 保留占位，交给 ImageLightbox 显示重试 UI
  //   · 不在拉、也没失败      → 这一页没有带来任何新图，回退到最后一张，不让用户卡住
  useEffect(() => {
    if (lightboxIndex === null) return;
    if (lightboxIndex <= images.length - 1) return;
    const awaitingNextPage =
      lightboxIndex === images.length &&
      hasNextPage &&
      (imagesQuery.isFetchingNextPage || nextPageFailed);
    if (awaitingNextPage) return;
    if (images.length === 0) {
      setLightboxIndex(null);
      return;
    }
    // 回退到已加载的最后一张，而不是直接关弹窗 —— 关掉会让用户以为是自己误触
    setLightboxIndex(images.length - 1);
  }, [
    images.length,
    lightboxIndex,
    hasNextPage,
    imagesQuery.isFetchingNextPage,
    nextPageFailed,
  ]);

  const isFetchingNextPage = imagesQuery.isFetchingNextPage;

  const navigateLightbox = useCallback(
    (delta: number) => {
      setLightboxIndex((current) => {
        if (current === null) return current;
        const next = current + delta;
        if (next < 0 || next > images.length) return current;
        // 走到末尾再按「下一张」：就地续加载下一页，而不是把用户卡住。
        // 已在拉下一页时不重复触发 —— 否则连按右键会每按一次发一个请求，
        // 而它们请求的是同一个 pageParam，纯属放大器。
        if (next === images.length) {
          if (!hasNextPage) return current;
          if (!isFetchingNextPage) void fetchNextPage();
          return next;
        }
        return next;
      });
    },
    [images.length, hasNextPage, fetchNextPage, isFetchingNextPage],
  );

  const clearFilters = () => {
    setSelectedTag(null);
    setSearchTerm('');
  };

  const { copied: copiedShareLink, copy: copyShareLink } = useCopyFeedback();

  // 筛选状态本就写进了地址栏（readGalleryQuery/writeGalleryQuery），
  // 但用户不知道这条链接可以分享。直接把当前完整地址复制走。
  const handleCopyShareLink = useCallback(() => {
    void copyShareLink(window.location.href, '筛选链接已复制，发给别人打开即是这个结果');
  }, [copyShareLink]);

  // 稳定引用：配合 MasonryTile 的 memo，搜索输入等无关渲染不会逐张重排瓦片
  const openTile = useCallback((index: number) => setLightboxIndex(index), []);

  return (
    <div className="relative z-10 mx-auto max-w-6xl px-4 pb-24 pt-[calc(var(--header-h)+32px)] sm:px-6">
      {/* 页头 */}
      <div className="reveal mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="section-eyebrow">
            <Images className="h-3.5 w-3.5" aria-hidden="true" />
            公共图库
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">二次元图库</h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            点任意一张看大图，左右方向键切换，Esc 关闭。
            {total > 0 && (
              <>
                {' '}共 <span className="font-semibold text-foreground tabular-nums">{total}</span> 张
                {hasFilter ? '（当前筛选结果）' : ''}。
              </>
            )}
          </p>
        </div>

        <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" aria-hidden="true" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              maxLength={MAX_SEARCH_LENGTH}
              placeholder="搜索标题…"
              aria-label="搜索图片标题"
              className={`h-10 rounded-xl pl-9 ${searchTerm ? 'pr-11' : ''}`}
            />
            {/* 只清搜索词的按钮。原先想清掉搜索词，要么手动退格，要么点「清空筛选」——
                后者会把标签也一起清掉，等于要用户放弃另一半筛选条件。
                p-2.5 把可点区域撑到 34px：原先 p-1.5 只有 26px，拇指在小屏上
                很难点中（相邻就是输入框）。视觉上图标仍是 14px，只是热区变大。 */}
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                aria-label="清除搜索词"
                title="清除搜索词"
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-lg p-2.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
          {/* 筛选生效时才出现：原先只能滚到空结果页里清筛选，筛选条件在地址栏里也看不见 */}
          {hasFilter && (
            <>
              <Button
                variant="ghost"
                onClick={handleCopyShareLink}
                className="h-10 shrink-0 rounded-xl px-3 text-xs text-muted-foreground hover:text-foreground"
              >
                {copiedShareLink ? (
                  <Check className="mr-1 h-3.5 w-3.5 text-success-ink" aria-hidden="true" />
                ) : (
                  <Link2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                )}
                {copiedShareLink ? '已复制' : '复制链接'}
              </Button>
              <Button
                variant="ghost"
                onClick={clearFilters}
                className="h-10 shrink-0 rounded-xl px-3 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                清空筛选
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 标签筛选 */}
      {tags.length > 0 && (
        <div className="reveal category-strip mb-6 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory sm:flex-wrap sm:overflow-visible">
          <TagChip active={selectedTag === null} onClick={() => setSelectedTag(null)}>
            全部
          </TagChip>
          {tags.map((tag) => (
            <TagChip
              key={tag}
              active={selectedTag === tag}
              onClick={() => setSelectedTag((current) => (current === tag ? null : tag))}
            >
              <Tag className="mr-1 inline h-3 w-3 align-[-2px]" aria-hidden="true" />
              {tag}
            </TagChip>
          ))}
        </div>
      )}

      {/* 三种状态：加载 / 出错 / 空 */}
      {isInitialLoading ? (
        <div className="reveal columns-2 gap-3 sm:columns-3 sm:gap-4 lg:columns-4">
          {Array.from({ length: BROWSE_PAGE_SIZE }).map((_, i) => (
            <div
              key={i}
              className="mb-3 break-inside-avoid rounded-2xl skeleton-shimmer sm:mb-4"
              style={{ aspectRatio: String(SKELETON_RATIOS[i % SKELETON_RATIOS.length]) }}
            />
          ))}
        </div>
      ) : isInitialError ? (
        <ErrorState
          title="图库加载失败"
          message={getErrorMessage(imagesQuery.error, '请稍后重试')}
          onRetry={() => imagesQuery.refetch()}
        />
      ) : isEmpty ? (
        <EmptyState
          icon={hasFilter ? SearchX : Images}
          title={hasFilter ? '没有匹配的图片' : '图库还是空的'}
          message={
            hasFilter
              ? '换个关键词，或清空筛选条件看看全部图片。'
              : '等管理员导入第一批图片后这里就会热闹起来。'
          }
        >
          {hasFilter && (
            <Button variant="outline" onClick={clearFilters}>
              清空筛选
            </Button>
          )}
        </EmptyState>
      ) : (
        <>
          <div
            className={`columns-2 gap-3 transition-opacity duration-200 sm:columns-3 sm:gap-4 lg:columns-4 ${
              imagesQuery.isPlaceholderData ? 'opacity-60' : 'opacity-100'
            }`}
          >
            {images.map((image, index) => (
              <MasonryTile
                key={image.id}
                image={image}
                index={index}
                priority={index === 0}
                onOpen={openTile}
              />
            ))}
          </div>

          <div className="mt-8 flex flex-col items-center gap-3">
            {/* 续加载失败：就地提示 + 重试，不把已加载的图换掉 */}
            {nextPageFailed && (
              <p role="alert" className="text-xs font-medium text-destructive-ink">
                加载更多失败：{getErrorMessage(imagesQuery.error, '请稍后重试')}
              </p>
            )}
            {/* 加载更多是纯视觉结果：读屏用户点完按钮，DOM 只是「多了几张瓦片」，
                没有任何提示说明加载是否完成。用常驻 live region 播报状态变化
                （按钮文案/到底提示本身不播报，因为焦点还在按钮上、不会重读）。 */}
            <p className="sr-only" role="status" aria-live="polite">
              {imagesQuery.isFetchingNextPage
                ? '正在加载更多图片'
                : imagesQuery.hasNextPage
                  ? `已加载 ${images.length} 张，还有更多`
                  : `已全部加载，共 ${images.length} 张`}
            </p>
            {imagesQuery.hasNextPage ? (
              <Button
                variant="outline"
                className="h-11 rounded-xl bg-white px-6 hover:bg-brand-50"
                onClick={() => void imagesQuery.fetchNextPage()}
                disabled={imagesQuery.isFetchingNextPage}
              >
                {imagesQuery.isFetchingNextPage ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    加载中…
                  </>
                ) : (
                  '加载更多'
                )}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">已经到底了 · 共 {images.length} 张</p>
            )}
          </div>
        </>
      )}

      <ImageLightbox
        images={images}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNavigate={navigateLightbox}
        hasMore={hasNextPage}
        nextFailed={nextPageFailed}
        onRetryNext={() => void fetchNextPage()}
      />
    </div>
  );
}
