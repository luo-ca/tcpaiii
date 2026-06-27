import { Card, CardContent } from '@/components/ui/card';
import { Zap, Shield, Tag, Heart, Sparkles, ArrowRight } from 'lucide-react';

const features = [
  {
    icon: Zap,
    title: '极速响应',
    desc: '边缘节点加速，毫秒级响应，图片秒开无压力',
    color: 'from-blue-500 to-cyan-400',
    textColor: 'text-blue-500',
    bgColor: 'bg-blue-50',
  },
  {
    icon: Shield,
    title: '稳定可靠',
    desc: 'URL 校验、去重检测，接口输出始终稳定',
    color: 'from-emerald-500 to-teal-400',
    textColor: 'text-emerald-500',
    bgColor: 'bg-emerald-50',
  },
  {
    icon: Tag,
    title: '丰富分类',
    desc: '按标签组织图片，支持随机与定向精准调用',
    color: 'from-indigo-500 to-violet-500',
    textColor: 'text-indigo-500',
    bgColor: 'bg-indigo-50',
  },
  {
    icon: Heart,
    title: '开放使用',
    desc: '无需复杂配置，前端、Markdown、脚本均可接入',
    color: 'from-fuchsia-500 to-pink-500',
    textColor: 'text-fuchsia-500',
    bgColor: 'bg-fuchsia-50',
  },
];

export function WhyChoose() {
  return (
    <section id="features" className="relative z-10 py-16 sm:py-20 px-4 sm:px-6 scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <div className="section-header">
          <p className="section-eyebrow">
            <Sparkles className="w-3.5 h-3.5" />
            核心优势
          </p>
          <h2>为什么选择随机图片 API</h2>
          <p>简单、快速、可靠的随机图片接口服务</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f, i) => (
            <Card key={i} className="glass-card rounded-2xl hover-lift border-white/60 group">
              <CardContent className="p-6">
                <div
                  className={`feature-icon-wrap w-12 h-12 rounded-2xl bg-gradient-to-br ${f.color} flex items-center justify-center text-white mb-5 shadow-lg`}
                >
                  <f.icon className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-[17px] text-foreground mb-2 tracking-tight">
                  {f.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                <div
                  className={`mt-4 flex items-center gap-1 text-xs font-medium ${f.textColor} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
                >
                  <span>了解更多</span>
                  <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
