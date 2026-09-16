import { Shield, Database, Zap, Globe, Code, ExternalLink } from 'lucide-react';

const items = [
  {
    icon: Shield,
    title: 'URL 校验',
    desc: '添加图片时自动校验 URL 格式',
    color: 'text-brand-500',
    bg: 'bg-brand-50',
  },
  {
    icon: Database,
    title: '重复拦截',
    desc: '相同 URL 会自动阻止重复添加',
    color: 'text-iris-500',
    bg: 'bg-iris-50',
  },
  {
    icon: Zap,
    title: '边缘计算',
    desc: 'EdgeOne 边缘节点，延迟<50ms',
    color: 'text-brand-500',
    bg: 'bg-brand-50',
  },
  {
    icon: Globe,
    title: 'KV 存储',
    desc: '数据持久化在边缘节点',
    color: 'text-iris-500',
    bg: 'bg-iris-50',
  },
  {
    icon: Code,
    title: 'CORS 支持',
    desc: '接口支持跨域调用与前端直接接入',
    color: 'text-brand-500',
    bg: 'bg-brand-50',
  },
  {
    icon: ExternalLink,
    title: '302 直链',
    desc: '默认以重定向方式返回图片链接',
    color: 'text-iris-500',
    bg: 'bg-iris-50',
  },
];

export function SecurityFeatures() {
  return (
    <div className="mx-auto mt-4 max-w-4xl px-4 pb-4 sm:px-6">
      <div className="glass-strong reveal rounded-2xl p-6">
        {/* 该组件只在 `/docs` 渲染，是「API 文档」h1 之下的二级区块 */}
        <h2 className="mb-5 flex items-center gap-2 text-base font-bold">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-ink bg-brand-50">
            <Shield className="h-4 w-4 text-brand-500" aria-hidden="true" />
          </div>
          安全防护与性能优化
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map((item, i) => (
            <div
              key={i}
              className="group flex items-start gap-3 rounded-xl p-3.5 transition-colors hover:bg-muted/60"
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-ink ${item.bg} mt-0.5 transition-transform duration-200 group-hover:scale-110`}
              >
                <item.icon className={`h-4.5 w-4.5 ${item.color}`} aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground/90">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
