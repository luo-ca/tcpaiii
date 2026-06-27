import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
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

  const statCards = [
    {
      label: '总调用量',
      value: formatNumber(stats?.totalRequests ?? 0),
      icon: TrendingUp,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
      gradientFrom: 'from-blue-500',
      gradientTo: 'to-cyan-400',
      sub: '累计请求总次数',
    },
    {
      label: '今日调用',
      value: formatNumber(stats?.todayRequests ?? 0),
      icon: Clock,
      color: 'text-indigo-500',
      bgColor: 'bg-indigo-50',
      gradientFrom: 'from-indigo-500',
      gradientTo: 'to-blue-400',
      sub: stats?.lastRequestAt
        ? new Date(stats.lastRequestAt).toLocaleDateString('zh-CN')
        : '暂无数据',
    },
    {
      label: '接入站点',
      value: formatNumber(stats?.totalSites ?? 0),
      icon: Globe,
      color: 'text-cyan-500',
      bgColor: 'bg-cyan-50',
      gradientFrom: 'from-cyan-500',
      gradientTo: 'to-teal-400',
      sub: '使用本 API 的网站',
    },
    {
      label: '图片总数',
      value: formatNumber(stats?.totalImages ?? 0),
      icon: Layers,
      color: 'text-fuchsia-500',
      bgColor: 'bg-fuchsia-50',
      gradientFrom: 'from-fuchsia-500',
      gradientTo: 'to-pink-400',
      sub: `${stats?.tags?.length ?? 0} 个分类`,
    },
  ];

  return (
    <section id="stats" className="relative z-10 py-16 sm:py-20 px-4 sm:px-6 scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <div className="section-header">
          <p className="section-eyebrow">
            <TrendingUp className="w-3.5 h-3.5" />
            实时数据
          </p>
          <h2>实时统计</h2>
          <p>API 调用数据与图库资源概览</p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {statCards.map((card, i) => (
            <Card key={i} className="glass-card rounded-2xl hover-lift border-white/60 overflow-hidden">
              <CardContent className="p-4 sm:p-5">
                <div className="relative h-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className={`w-10 h-10 rounded-xl ${card.bgColor} flex items-center justify-center`}>
                      <card.icon className={`w-5 h-5 ${card.color}`} />
                    </div>
                    <div
                      className={`absolute top-0 right-0 w-16 h-16 rounded-full bg-gradient-to-b ${card.gradientFrom} ${card.gradientTo} opacity-40`}
                    />
                  </div>
                  <p className="text-2xl sm:text-3xl font-black text-foreground tracking-tight stat-value">
                    {card.value}
                  </p>
                  <p className="text-xs font-medium text-muted-foreground mt-1">{card.label}</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5 truncate">{card.sub}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Chart Card */}
        <Card className="glass-strong rounded-2xl border-white/60">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-blue-500 to-cyan-400" />
                <span className="text-sm font-semibold">7-day trend</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-blue-50 text-blue-600 border border-blue-100 px-3 py-1 text-xs font-medium">
                  近 7 天 {formatNumber(totalRecentRequests)} 次
                </span>
              </div>
            </div>
            <div className="h-48">
              {hasTrendData ? (
                <ChartContainer
                  config={{
                    requests: {
                      label: 'Requests',
                      color: 'hsl(222 89% 55%)',
                    },
                  }}
                  className="h-full w-full"
                >
                  <AreaChart data={chartData} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="requestsTrend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-requests)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--color-requests)" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="rgba(15,23,42,0.06)" />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tick={{ fontSize: 11, fill: 'rgba(15,23,42,0.45)' }}
                    />
                    <YAxis
                      width={32}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: 'rgba(15,23,42,0.45)' }}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent indicator="line" labelKey="fullDate" />}
                    />
                    <Area
                      type="monotone"
                      dataKey="requests"
                      stroke="var(--color-requests)"
                      strokeWidth={2.5}
                      fill="url(#requestsTrend)"
                      dot={{ r: 3, strokeWidth: 2, fill: 'white' }}
                      activeDot={{ r: 5, strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ChartContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground/40">
                  <div className="text-center">
                    <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-25" />
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
