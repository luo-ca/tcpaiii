import { Card, CardContent } from '@/components/ui/card';
import { Clock } from 'lucide-react';

const updates = [
  {
    date: '2026-04-29',
    title: 'Pages 化与图库升级',
    tag: 'Major',
    items: [
      '脱离 PHP 接口，改为 ESA Functions & Pages 与 EdgeKV 提供图片服务',
      '新增图库展示与管理能力，支持图片标签、搜索和在线预览',
      '图库分页加入页码、首页末页、跳转页数和每页数量选择',
      '优化接口缓存、分页加载、相邻页预取和图片加载性能',
    ],
  },
  {
    date: '2025-06-15',
    title: '展示站与文档',
    tag: 'Update',
    items: [
      '首页新增「更新日志」区块，导航更清晰点跳转',
      'API 文档扩充：分类与 data 列表说明、JSON 返回（含示例）',
      '新增实时统计功能：统计调用和实时统计趋势',
      '优化调整了布局和细节，提升性能',
    ],
  },
  {
    date: '2025-04-10',
    title: '接口约定',
    tag: 'API',
    items: [
      '分类统一使用 api/random?tag=xx，并兼容旧版 type=xx 参数',
      'JSON 返回图片 id、url、title、tags、createdAt，统计接口新增最近 7 天调用数据',
    ],
  },
];

const tagColors: Record<string, string> = {
  Major: 'bg-blue-50 text-blue-600 border-blue-100',
  Update: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  API: 'bg-amber-50 text-amber-600 border-amber-100',
};

export function Changelog() {
  return (
    <section id="changelog" className="relative z-10 py-16 sm:py-20 px-4 sm:px-6 scroll-mt-20">
      <div className="section-header">
        <p className="section-eyebrow">
          <Clock className="w-3.5 h-3.5" />
          版本历史
        </p>
        <h2>更新日志</h2>
        <p>展示站点与接口说明的调整记录（持续更新）</p>
      </div>

      <div className="max-w-3xl mx-auto space-y-5">
        {updates.map((update, i) => (
          <div key={i} className="flex gap-5">
            {/* Timeline indicator */}
            <div className="flex flex-col items-center shrink-0">
              <div className="w-3 h-3 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 mt-2 ring-4 ring-background shadow-[0_0_0_1px_rgba(29,111,235,0.3)]" />
              {i < updates.length - 1 && (
                <div className="w-px flex-1 mt-2 bg-gradient-to-b from-border to-transparent" />
              )}
            </div>

            <Card className="glass-card rounded-2xl flex-1 hover-lift border-white/60">
              <CardContent className="p-5">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-xs text-muted-foreground font-mono">{update.date}</span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${tagColors[update.tag] ?? ''}`}
                  >
                    {update.tag}
                  </span>
                  <span className="text-sm font-semibold text-foreground">{update.title}</span>
                </div>
                <ul className="space-y-1.5">
                  {update.items.map((item, j) => (
                    <li
                      key={j}
                      className="text-sm text-muted-foreground flex items-start gap-2 leading-relaxed"
                    >
                      <span className="text-blue-400 mt-1.5 shrink-0 select-none text-[8px]">
                        ●
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </section>
  );
}
