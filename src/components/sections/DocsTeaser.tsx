import { ArrowRight, BookOpen, Code2, ShieldCheck, Sparkles } from 'lucide-react';
import { NavLink } from '@/components/ui/nav-link';

const HIGHLIGHTS = [
  { icon: Code2, label: '分类参数', desc: '按标签拿指定题材' },
  { icon: Sparkles, label: 'JSON 返回', desc: '拿到标题与标签元数据' },
  { icon: ShieldCheck, label: '高级用法', desc: '缓存、防盗链与安全策略' },
];

/**
 * 首页的文档入口。
 *
 * 首页不再塞完整文档（原先 `ApiDocsSection` 在 App.tsx 里被渲染了两次，
 * 而且把「拿到地址」这个核心动作埋到了第 6 屏）。这里只保留一个轻量引导，
 * 完整文档独立成页 /docs。
 */
export function DocsTeaser() {
  return (
    <section id="docs-teaser" className="relative z-10 px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="reveal glass-strong overflow-hidden rounded-3xl border border-white/60 shadow-lg">
          <div className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="section-eyebrow">
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                接入文档
              </p>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                需要更多用法？
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                完整的参数说明、返回格式与接入示例都在文档页里。基础调用就是上面那个地址，
                直接拿去用即可，无需申请 Key。
              </p>

              <div className="mt-5 flex flex-wrap gap-2.5">
                {HIGHLIGHTS.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center gap-2 rounded-xl border border-border/60 bg-white/60 px-3 py-2"
                  >
                    <item.icon className="h-3.5 w-3.5 shrink-0 text-brand-500" aria-hidden="true" />
                    <span className="text-xs font-semibold text-foreground">{item.label}</span>
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {item.desc}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <NavLink
              to="/docs"
              className="gradient-button inline-flex shrink-0 items-center justify-center gap-1.5 self-start rounded-xl px-5 py-3 text-sm font-medium text-white lg:self-auto"
            >
              查看完整 API 文档
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </NavLink>
          </div>
        </div>
      </div>
    </section>
  );
}
