import { Card, CardContent } from '@/components/ui/card';
import { Zap, Shield, Tag, Heart, Sparkles } from 'lucide-react';

const features = [
  {
    icon: Zap,
    title: '极速响应',
    desc: '边缘节点加速，毫秒级响应，图片秒开无压力',
    tile: 'bg-brand-500',
    iconColor: 'text-white',
  },
  {
    icon: Shield,
    title: '稳定可靠',
    desc: 'URL 校验、去重检测，接口输出始终稳定',
    tile: 'bg-iris-500',
    iconColor: 'text-white',
  },
  {
    icon: Tag,
    title: '丰富分类',
    desc: '按标签组织图片，支持随机与定向精准调用',
    tile: 'bg-brand-500',
    iconColor: 'text-white',
  },
  {
    icon: Heart,
    title: '开放使用',
    desc: '无需复杂配置，前端、Markdown、脚本均可接入',
    tile: 'bg-iris-500',
    iconColor: 'text-white',
  },
];

export function WhyChoose() {
  return (
    <section id="features" className="relative z-10 px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
      <div className="max-w-6xl mx-auto">
        <div className="section-header reveal">
          <p className="section-eyebrow">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            核心优势
          </p>
          <p className="kana-label mt-3">フィーチャー</p>
          <h2>为什么选择随机图片 API</h2>
          <p>简单、快速、可靠的随机图片接口服务</p>
        </div>

        <div className="reveal grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <Card key={i} className="glass-card rounded-2xl">
              <CardContent className="p-6">
                <div
                  className={`halftone-dots mb-5 flex h-12 w-12 items-center justify-center rounded-xl border-2 border-ink shadow-[2px_2px_0_0_var(--color-ink)] ${f.tile}`}
                >
                  <f.icon className={`h-6 w-6 ${f.iconColor}`} aria-hidden="true" />
                </div>
                <h3 className="mb-2 text-[17px] font-bold tracking-tight text-foreground">
                  {f.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
