import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, Mail, MessageSquare, ChevronRight } from 'lucide-react';

export function ImageSubmission() {
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
                <p className="text-xs text-muted-foreground mt-0.5">
                  添加 QQ 好友投稿图片资源
                </p>
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
                <p className="text-xs text-muted-foreground mt-0.5">
                  在派立方社区发帖投稿
                </p>
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
