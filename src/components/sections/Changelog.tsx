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
  // soft 底 + ink 字：12px 白字压亮底（#007aff/#34c759）都够不到 AA，
  // 与 admin 状态徽章同一套语义梯度。
  Major: 'bg-brand-50 text-brand-700',
  Update: 'bg-success-soft text-success-ink',
  API: 'bg-warning-soft text-warning-ink',
};

export function Changelog() {
  return (
    <section id="changelog" className="relative z-10 px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
      <div className="section-header reveal">
        <p className="section-eyebrow">
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          版本历史
        </p>
        <p className="kana-label mt-3">アップデート</p>
        <h2>更新日志</h2>
        <p>展示站点与接口说明的调整记录（持续更新）</p>
      </div>

      {/* 时间轴改成「外层定位 + 绝对定位竖线」，而不是让每条的竖线自己 flex-1 撑满。
          原先的写法每条各自画一段线，段与段之间留着 space-y-5(20px) + 圆点 mt-2(8px)
          = 28px 的空档 —— 实测 sepBottom=4216 而下一个圆点 top=4244，
          虚线在每条之间都断 28px，整条时间轴看起来是碎的。
          现在竖线由外层容器统一铺满（top-2 bottom-2），整条只画一次
          （条目多于一条时才需要）。与圆点同层，不再受单条卡片高度影响。 */}
      <div className="relative max-w-3xl mx-auto">
        {updates.length > 1 && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-2 left-[6px] top-2 w-px border-l-2 border-dashed border-ink/20"
          />
        )}
        <div className="space-y-5">
        {updates.map((update, i) => (
          <div key={i} className="reveal flex gap-5">
            {/* 圆点：外层竖线已在同一 x 上，这里只负责节点本身 */}
            <div className="flex shrink-0 flex-col items-center">
              <div className="mt-2 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-ink bg-brand-500 ring-4 ring-background" />
            </div>

            <Card className="glass-card flex-1 rounded-2xl">
              <CardContent className="p-5">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-xs text-muted-foreground font-mono">{update.date}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide ${tagColors[update.tag] ?? ''}`}
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
                      <span
                        aria-hidden="true"
                        className="mt-[9px] h-1.5 w-1.5 shrink-0 select-none rounded-full bg-brand-400"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        ))}
        </div>
      </div>
    </section>
  );
}
