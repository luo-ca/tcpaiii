import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Plus, Link, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  MAX_BATCH_IMAGE_COUNT,
  MAX_IMAGE_URL_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_TAG_LENGTH,
  MAX_TAGS_PER_IMAGE,
} from '@/lib/constants';
import { fetchExistingImageUrlSet, createImage, batchCreateImages } from '@/lib/api';
import { getErrorMessage, parseTagsInput, parseBatchUrls, canonicalizeImageUrl } from '@/lib/helpers';

// ============================================================
// Add Image Dialog
// ============================================================

export function AddImageDialog({
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
      createImage({ url: canonicalizeImageUrl(url) ?? url.trim(), title: title.trim() || '未命名图片', tags: parseTagsInput(tagsInput) }, adminToken),
    onSuccess: () => {
      toast.success('图片添加成功');
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
    // 去重预检还没落地时 validNew 同样混着库里已有地址：
    // 按钮已禁用，这里是回车直发等旁路的第二道闸
    if (existingUrlsQuery.isLoading) {
      toast.error('正在读取库内地址做去重预检，读完即可导入');
      return;
    }
    // 去重预检失败时 validNew 其实混着库里已有地址，
    // 「只导入全新 N 张」的承诺不成立，必须拦住而不是静默重复导入
    if (existingUrlsQuery.isError) {
      toast.error('库内地址去重预检失败，暂时无法判断哪些是全新地址，请先点「重试」再导入');
      return;
    }
    if (batchPreview.invalid.length > 0) {
      toast.error(`有 ${batchPreview.invalid.length} 行不是有效的 http(s) 地址，请先删掉标红的行`);
      return;
    }
    if (cleanUrls.length === 0) {
      if (batchPreview.duplicatesInBatch.length > 0 || batchPreview.alreadyExists.length > 0) {
        toast.error('没有可导入的新地址：本次粘贴全是重复或库里已有的 URL');
      } else {
        toast.error('请至少填写一个图片地址');
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
      // 成功的那几条要从输入框里去掉。部分失败时弹窗会留在原地（见下），
      // 而 textarea 里仍是原封不动的一整批 —— 用户顺手再点一次「导入」，
      // 刚加成功的那些会被后端判为 'URL already exists'，
      // 于是一屏红字报错，报的却全是已经成功的工作。
      const succeededUrls = new Set(
        result.results
          .filter((item) => item.success)
          .map((item) => canonicalizeImageUrl(item.url))
          .filter((url): url is string => Boolean(url)),
      );
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
        } else if (succeededUrls.size > 0) {
          // 只留下没成功的那几行，用户可以直接改完再点一次。
          // 两边都走 canonicalizeImageUrl 再比：服务端回显的是规范化后的
          // URL（new URL().toString()），而 textarea 里是用户原样粘贴的那一行 ——
          // 大小写主机名、裸域名补的尾斜杠、百分号转义都会让两者字面不同。
          // 直接拿 trimmed 原文去 Set.has 会漏删这些行，用户再点一次导入
          // 仍然会撞上一片 'URL already exists'。
          setBatchUrls((current) =>
            current
              .split(/\r?\n/)
              .filter((line) => {
                const trimmed = line.trim();
                if (!trimmed) return false;
                const canonical = canonicalizeImageUrl(trimmed);
                return !(canonical && succeededUrls.has(canonical));
              })
              .join('\n'),
          );
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
      // 守卫必须在 await 之前置位：onRequireToken 在密钥未验证时会打一次
      // /api/admin/verify。那段往返期间按钮若仍可点，用户连点就会进入第二次
      // 提交、同一 URL 发两次 POST（第二次 409「该图片地址已存在」误报失败）。
      setLoading(true);
      try {
        if (!(await onRequireToken())) {
          setLoading(false);
          return;
        }

        if (!url.trim()) {
          toast.error('请填写图片地址');
          setLoading(false);
          return;
        }

        // 与批量模式同一把尺子：canonicalizeImageUrl 会拒掉非 http(s)、带凭据、
        // 超长或无法解析的地址。只靠 input 的 type="url" 挡不住 —— 实测
        // ftp://host/a.jpg 与 javascript:alert(1) 都能通过原生校验被打到服务端，
        // 而服务端会回英文 url must be a valid http(s) URL，管理员看到的是英文报错。
        const canonical = canonicalizeImageUrl(url);
        if (!canonical) {
          toast.error('图片地址必须是有效的 http(s) URL');
          setLoading(false);
          return;
        }

        singleMutation.mutate(undefined, { onSettled: () => setLoading(false) });
      } catch {
        setLoading(false);
      }
    })();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="sticker" className="gap-2 rounded-xl">
          <Plus className="w-4 h-4" aria-hidden="true" />
          添加图片
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-strong rounded-2xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="w-5 h-5 text-brand-500" aria-hidden="true" />
            添加外链图片
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl border-2 border-ink bg-secondary p-1">
                    {/* 重试也要有进行中反馈：isFetching 期间禁用 + 换文案，否则预检失败时
                        用户点一下没反应（请求要等往返），容易连点放大请求。
                        与首页「图库精选」的重试按钮同口径。 */}
          <button
            type="button"
            aria-pressed={mode === 'single'}
            onClick={() => setMode('single')}
            className={`h-8 rounded-lg text-xs font-medium transition-[background-color,color,box-shadow] duration-200 ${
              mode === 'single'
                ? 'bg-white text-foreground shadow-[2px_2px_0_0_var(--color-ink)]'
                : 'text-muted-foreground hover:bg-brand-50 hover:text-foreground'
            }`}
          >
            单张添加
          </button>
          <button
            type="button"
            aria-pressed={mode === 'batch'}
            onClick={() => setMode('batch')}
            className={`h-8 rounded-lg text-xs font-medium transition-[background-color,color,box-shadow] duration-200 ${
              mode === 'batch'
                ? 'bg-white text-foreground shadow-[2px_2px_0_0_var(--color-ink)]'
                : 'text-muted-foreground hover:bg-brand-50 hover:text-foreground'
            }`}
          >
            批量添加
          </button>
        </div>

        {mode === 'single' ? (
          <form onSubmit={handleSingleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="url">图片地址 *</Label>
              <Input
                id="url"
                type="url"
                maxLength={MAX_IMAGE_URL_LENGTH}
                className="rounded-lg"
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
                className="rounded-lg"
                placeholder="给图片起个名字"
                maxLength={MAX_TITLE_LENGTH}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">标签（逗号分隔）</Label>
              <Input
                id="tags"
                className="rounded-lg"
                placeholder="风景, 自然, 山脉"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                最多 {MAX_TAGS_PER_IMAGE} 个，每个最长 {MAX_TAG_LENGTH} 字，超出部分不会入库
              </p>
            </div>
            <Button type="submit" variant="sticker" className="w-full rounded-xl" disabled={loading}>
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
                className="w-full min-h-[140px] rounded-lg border-2 border-ink bg-white px-3 py-2 text-sm placeholder:text-muted-foreground resize-y font-mono"
              />
              <p className="text-xs text-muted-foreground">
                粘贴后自动归一化并预检，单次最多 {MAX_BATCH_IMAGE_COUNT} 张
                {existingUrlsQuery.isLoading ? '（正在读取库内地址…）' : ''}
              </p>
              {existingUrlsQuery.isError && (
                <p className="text-xs font-medium text-destructive">
                  库内地址读取失败：暂时无法判断哪些是全新地址，导入会被拦下。
                  {/* 重试要有进行中反馈：请求期间禁用并换文案，避免连点放大请求 */}
                  <button
                    type="button"
                    disabled={existingUrlsQuery.isFetching}
                    aria-busy={existingUrlsQuery.isFetching}
                    
                    
                    onClick={() => void existingUrlsQuery.refetch()}
                    className="ml-1 underline underline-offset-2 disabled:opacity-60"
                  >
                    {existingUrlsQuery.isFetching ? '重试中…' : '重试'}
                  </button>
                </p>
              )}
            </div>

            {batchUrls.trim() && (
              <div className="rounded-xl border-2 border-ink bg-white p-3">
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <Badge className="rounded-full bg-success-soft text-success-ink border-success-line">
                    可导入 {batchPreview.validNew.length}
                  </Badge>
                  {batchPreview.duplicatesInBatch.length > 0 && (
                    <Badge className="rounded-full bg-warning-soft text-warning-ink border-warning-line">
                      本次重复 {batchPreview.duplicatesInBatch.length}
                    </Badge>
                  )}
                  {batchPreview.alreadyExists.length > 0 && (
                    <Badge variant="outline" className="rounded-full text-muted-foreground">
                      库里已有 {batchPreview.alreadyExists.length}
                    </Badge>
                  )}
                  {batchPreview.invalid.length > 0 && (
                    <Badge className="rounded-full bg-destructive-soft text-destructive-ink border-destructive-line">
                      无效 {batchPreview.invalid.length}
                    </Badge>
                  )}
                </div>

                {batchPreview.invalid.length > 0 && (
                  <div className="mt-2 max-h-20 overflow-y-auto rounded-lg bg-destructive-soft p-2 font-mono text-[11px] text-destructive-ink">
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
                className="rounded-lg"
                placeholder="风景, 自然"
                value={batchTags}
                onChange={(e) => setBatchTags(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">所有图片将使用相同的标签</p>
            </div>

            {batchFailures.length > 0 && (
              <div className="max-h-28 overflow-y-auto rounded-xl border border-destructive-line bg-destructive-soft p-2.5 text-xs text-destructive-ink">
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
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center justify-between text-xs text-muted-foreground"
                >
                  <span>添加进度</span>
                  <span>
                    {progress.current} / {progress.total}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={progress.total}
                  aria-valuenow={progress.current}
                  aria-label="批量导入进度"
                  className="h-2 overflow-hidden rounded-full border-2 border-ink bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-brand-500 transition-[width] duration-300"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <Button
              type="submit"
              variant="sticker"
              className="w-full rounded-xl"
              disabled={loading || existingUrlsQuery.isLoading || batchPreview.validNew.length === 0}
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
