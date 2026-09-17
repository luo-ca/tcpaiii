import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, Clock, Globe, Layers, BarChart3 } from 'lucide-react';
import type { Stats } from '@/lib/types';
import { fetchStats } from '@/lib/api';
import { formatShortDate, formatNumber } from '@/lib/helpers';

export function RealtimeStats() {
  const { data: stats } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 15_000,
    staleTime: 15_000,
  });

  const dailyEntries = useMemo(
    () =>
      Object.entries(stats?.dailyRequests ?? {}).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    [stats?.dailyRequests],
  );
  const chartData = dailyEntries.map(([dateKey, count]) => ({
    date: formatShortDate(dateKey),
    fullDate: dateKey,
    requests: count,
  }));
  const totalRecentRequests = chartData.reduce((sum, item) => sum + item.requests, 0);
  const hasTrendData = chartData.some((item) => item.requests > 0);
  const maxDayRequests = chartData.reduce((max, item) => Math.max(max, item.requests), 0);

  // 一条数据都没有时整段不渲染。摆一排「0 次」比不显示更像故障。
  const hasAnyData =
    Boolean(stats) &&
    ((stats?.totalRequests ?? 0) > 0 ||
      (stats?.todayRequests ?? 0) > 0 ||
      (stats?.totalImages ?? 0) > 0);

  if (!hasAnyData) return null;

  const statCards = [
    {
      label: '总调用量',
      value: formatNumber(stats?.totalRequests ?? 0),
      icon: TrendingUp,
      tile: 'bg-brand-500',
      sub: '累计请求总次数',
    },
    {
      label: '今日调用',
      value: formatNumber(stats?.todayRequests ?? 0),
      icon: Clock,
      tile: 'bg-iris-500',
      sub: stats?.lastRequestAt
        ? new Date(stats.lastRequestAt).toLocaleDateString('zh-CN')
        : '暂无数据',
    },
    {
      label: '接入站点',
      value: formatNumber(stats?.totalSites ?? 0),
      icon: Globe,
      tile: 'bg-brand-500',
      sub: '使用本 API 的网站',
    },
    {
      label: '图片总数',
      value: formatNumber(stats?.totalImages ?? 0),
      icon: Layers,
      tile: 'bg-iris-500',
      sub: `${stats?.tags?.length ?? 0} 个分类`,
    },
  ];

  return (
    <section id="stats" className="relative z-10 px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
      <div className="max-w-6xl mx-auto">
        <div className="section-header reveal">
          <p className="section-eyebrow">
            <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
            实时数据
          </p>
          <p className="kana-label mt-3">ライブ統計</p>
          <h2>实时统计</h2>
          <p>API 调用数据与图库资源概览</p>
        </div>

        {/* Stat Cards */}
        <div className="reveal mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {statCards.map((card, i) => (
            <Card key={i} className="glass-card overflow-hidden rounded-2xl">
              <CardContent className="p-4 sm:p-5">
                <div className="relative h-full">
                  <div className="mb-4 flex items-center justify-between">
                    <div className={`halftone-dots flex h-10 w-10 items-center justify-center rounded-xl ${card.tile}`}>
                      <card.icon className="h-5 w-5 text-white" aria-hidden="true" />
                    </div>
                    {/* 贴角网点：漫画制版圆点阵列，替代模糊柔光 */}
                    <div
                      aria-hidden="true"
                      className="halftone-brand pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20"
                    />
                  </div>
                  <p className="text-2xl font-bold text-foreground tracking-tight stat-value sm:text-3xl">
                    {card.value}
                  </p>
                  <p className="mt-1 text-xs font-bold text-muted-foreground">{card.label}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground/60">{card.sub}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Chart Card */}
        <Card className="reveal glass-strong rounded-2xl">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="h-5 w-1.5 rounded-full border-2 border-ink bg-brand-500" />
                <span className="text-sm font-bold">近 7 天趋势</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-brand-500/20 bg-brand-50 px-3 py-1 text-xs font-bold text-brand-600">
                  近 7 天 {formatNumber(totalRecentRequests)} 次
                </span>
              </div>
            </div>
            <div className="relative h-56">
              {hasTrendData ? (
                <>
                  {/* faint gridlines */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 bottom-9 flex flex-col justify-between"
                  >
                    {[0, 1, 2, 3].map((line) => (
                      <div key={line} className="border-t border-dashed border-border" />
                    ))}
                  </div>
                  <div
                    className="relative flex h-full items-stretch gap-1 sm:gap-2"
                    role="img"
                    aria-label={`近 7 天调用趋势，共 ${formatNumber(totalRecentRequests)} 次`}
                  >
                    {chartData.map((item) => (
                      <div
                        key={item.fullDate}
                        className="flex min-w-0 flex-1 flex-col items-center justify-end"
                        title={`${item.fullDate}：${formatNumber(item.requests)} 次`}
                      >
                        <span className="flex h-5 items-end text-[11px] font-semibold tabular-nums text-foreground/70">
                          {item.requests > 0 ? formatNumber(item.requests) : ''}
                        </span>
                        <div className="flex h-32 w-full items-end justify-center sm:h-36">
                          <div
                            className="w-8 rounded-t-md border-2 border-ink border-b-0 bg-brand-500 transition-all hover:brightness-110 sm:w-12"
                            style={{
                              height:
                                item.requests > 0 && maxDayRequests > 0
                                  ? `${Math.max(8, (item.requests / maxDayRequests) * 100)}%`
                                  : '2px',
                              opacity: item.requests > 0 ? 1 : 0.3,
                            }}
                          />
                        </div>
                        <span className="mt-2 text-[11px] tabular-nums text-muted-foreground">
                          {item.date}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground/40">
                  <div className="text-center">
                    <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-25" aria-hidden="true" />
                    <p className="text-sm">暂无调用数据</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
