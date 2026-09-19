import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Tags, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { MAX_TAGS_PER_IMAGE } from '@/lib/constants';
import { batchUpdateImageTags } from '@/lib/api';
import { getErrorMessage, parseTagsInput } from '@/lib/helpers';

// ============================================================
// Batch Update Tags Dialog
// ============================================================

export function BatchUpdateTagsDialog({
  ids,
  adminToken,
  onSuccess,
  onRequireToken,
  children,
}: {
  ids: string[];
  adminToken: string;
  onSuccess: () => void;
  onRequireToken: () => Promise<boolean>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [addInput, setAddInput] = useState('');
  const [removeInput, setRemoveInput] = useState('');
  const [loading, setLoading] = useState(false);

  // 每次打开都清空输入：上一轮没提交的残留标签不该悄悄作用到新的选择上
  useEffect(() => {
    if (open) {
      setAddInput('');
      setRemoveInput('');
    }
  }, [open]);

  const addTags = parseTagsInput(addInput);
  const removeTags = parseTagsInput(removeInput);
  const hasChange = addTags.length > 0 || removeTags.length > 0;

  const mutation = useMutation({
    mutationFn: () =>
      batchUpdateImageTags({ ids, addTags, removeTags }, adminToken),
    onSuccess: (data) => {
      if (data.success > 0) {
        toast.success(`已更新 ${data.success} 张图片的标签`);
        setOpen(false);
      }
      if (data.failed > 0) {
        toast.error(`${data.failed} 张图片未命中（可能刚被删除）`);
      }
      if (data.success > 0) onSuccess();
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, '批量修改标签失败'));
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!hasChange) {
      toast.error('请至少填写一个要添加或要移除的标签');
      return;
    }
    void (async () => {
      if (!(await onRequireToken())) return;
      setLoading(true);
      mutation.mutate(undefined, { onSettled: () => setLoading(false) });
    })();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="glass-strong rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tags className="h-5 w-5 text-brand-500" aria-hidden="true" />
            批量修改标签 · {ids.length} 张
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="batch-add-tags">要添加的标签（逗号分隔，可选）</Label>
            <Input
              id="batch-add-tags"
              className="rounded-lg"
              placeholder="精选, 首页"
              value={addInput}
              onChange={(event) => setAddInput(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="batch-remove-tags">要移除的标签（逗号分隔，可选）</Label>
            <Input
              id="batch-remove-tags"
              className="rounded-lg"
              placeholder="待整理"
              value={removeInput}
              onChange={(event) => setRemoveInput(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              移除不区分大小写；每张图最多保留 {MAX_TAGS_PER_IMAGE} 个标签，超出部分不会入库
            </p>
          </div>
          <Button type="submit" variant="sticker" className="w-full rounded-xl" disabled={loading || !hasChange}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            应用到 {ids.length} 张
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
