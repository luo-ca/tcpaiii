import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, Mail, MessageSquare, ChevronRight } from 'lucide-react';

export function ImageSubmission() {
  return (
    <section id="contribute" className="relative z-10 px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
      <div className="section-header reveal">
        <p className="section-eyebrow">
          <Heart className="w-3.5 h-3.5" aria-hidden="true" />
          一起建设
        </p>
        <h2>图片投稿</h2>
        <p>欢迎投稿高质量图片，共建优质图片库</p>
      </div>

      <div className="reveal grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl mx-auto">
        <Card className="glass-card rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="halftone-dots flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500">
                <Mail className="h-5 w-5 text-white" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-bold">QQ 联系</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  添加 QQ 好友投稿图片资源
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-brand-500/20 bg-brand-50 p-3 text-center">
              <code className="text-sm font-bold text-brand-700">2553256126</code>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="halftone-dots flex h-10 w-10 items-center justify-center rounded-xl bg-iris-500">
                <MessageSquare className="h-5 w-5 text-white" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-bold">社区发帖</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  在派立方社区发帖投稿
                </p>
              </div>
            </div>
            <div className="text-center">
              <Button
                size="sm"
                variant="sticker"
                className="h-9 rounded-xl text-xs"
                asChild
              >
                <a href="https://www.paiii.cn/bbs/9" target="_blank" rel="noopener noreferrer">
                  前往投稿
                  <ChevronRight className="w-3.5 h-3.5 ml-1" aria-hidden="true" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
