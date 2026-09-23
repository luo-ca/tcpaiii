import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Edit3, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import type { ImageRecord } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { MAX_IMAGE_URL_LENGTH, MAX_TITLE_LENGTH, MAX_TAG_LENGTH, MAX_TAGS_PER_IMAGE } from '@/lib/constants';
import { updateImage } from '@/lib/api';
import { getErrorMessage, parseTagsInput, canonicalizeImageUrl } from '@/lib/helpers';

// ============================================================
// Edit Image Dialog
// ============================================================

export function EditImageDialog({
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
    // 只认「打开弹窗 / 换目标图片」两个事件：依赖整个 image 对象的话，
    // 后台刷新会给同一张图新对象身份，把用户正在输入的标题/标签凭空覆写掉
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, image.id]);

  const mutation = useMutation({
    mutationFn: () =>
      updateImage(image.id, { url: canonicalizeImageUrl(url) ?? url.trim(), title: title.trim(), tags: parseTagsInput(tagsInput) }, adminToken),
    onSuccess: () => {
      toast.success('图片已更新');
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
        toast.error('请填写图片地址');
        return;
      }

      // 与单张添加、批量导入同一把尺子：type="url" 允许 ftp: 与 javascript:，
      // 只靠原生校验会把它们放到服务端，再收到英文的 url must be a valid http(s) URL。
      const canonical = canonicalizeImageUrl(url);
      if (!canonical) {
        toast.error('图片地址必须是有效的 http(s) URL');
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
          className="sticker-chip h-7 w-7 rounded-lg p-0"
          aria-label={`编辑图片：${image.title || '未命名图片'}`}
        >
          <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-strong rounded-2xl sm:max-w-md">
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
              type="url"
              maxLength={MAX_IMAGE_URL_LENGTH}
              className="rounded-lg"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-title">标题</Label>
            <Input
              id="edit-title"
              className="rounded-lg"
              maxLength={MAX_TITLE_LENGTH}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-tags">标签</Label>
            <Input
              id="edit-tags"
              className="rounded-lg"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              最多 {MAX_TAGS_PER_IMAGE} 个，每个最长 {MAX_TAG_LENGTH} 字，超出部分不会入库
            </p>
          </div>
          <Button type="submit" variant="sticker" className="w-full rounded-xl" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" /> : null}
            保存
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
