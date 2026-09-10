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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 mt-4 pb-4">
      <div className="p-6 rounded-2xl glass-strong border border-white/60">
        <h3 className="font-bold text-base mb-5 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-50 flex items-center justify-center">
            <Shield className="w-4 h-4 text-brand-500" />
          </div>
          安全防护与性能优化
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3.5 rounded-xl hover:bg-muted/30 transition-colors group"
            >
              <div
                className={`w-9 h-9 rounded-xl ${item.bg} flex items-center justify-center shrink-0 mt-0.5 transition-transform duration-200 group-hover:scale-110`}
              >
                <item.icon className={`w-4.5 h-4.5 ${item.color}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground/90">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
