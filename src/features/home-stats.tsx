import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { BarChart3, Clock, Globe, Layers, TrendingUp } from 'lucide-react';

interface Stats {
  totalRequests: number;
  todayRequests: number;
  lastRequestAt: string | null;
  totalImages: number;
  totalSites?: number;
  dailyRequests?: Record<string, number>;
  tags: string[];
}

const APP_FALLBACK_DOMAIN = 'https://t.paiii.cn';
const EDGEONE_PREVIEW_QUERY_KEYS = ['eo_token', 'eo_time'] as const;

function appendCurrentPreviewParams(url: URL): URL {
  if (typeof window === 'undefined') return url;

  const currentParams = new URLSearchParams(window.location.search);
  for (const key of EDGEONE_PREVIEW_QUERY_KEYS) {
    const value = currentParams.get(key);
    if (value && !url.searchParams.has(key)) {
      url.searchParams.set(key, value);
    }
  }

  return url;
}

function buildApiPath(path: string): string {
  if (typeof window === 'undefined') return path;
  const url = appendCurrentPreviewParams(new URL(path, window.location.origin));
  return url.pathname + url.search + url.hash;
}

function isJsonContentType(contentType: string): boolean {
  return contentType.includes('application/json') || contentType.includes('+json');
}

async function fetchStats(): Promise<Stats> {
  const response = await fetch(buildApiPath('/api/stats'), { cache: 'no-store' });
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!response.ok) {
    throw new Error('Failed to fetch stats');
  }
  if (!isJsonContentType(contentType)) {
    throw new Error('Stats endpoint did not return JSON');
  }
  return await response.json() as Stats;
}

function formatShortDate(value: string): string {
  const [, month, day] = value.split('-');
  return month && day ? `${Number(month)}/${Number(day)}` : value;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}

export default function HomeStats() {
  const { data: stats } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 10000,
  });

  const dailyEntries = useMemo(
    () => Object.entries(stats?.dailyRequests ?? {}).sort(([left], [right]) => left.localeCompare(right)),
    [stats?.dailyRequests],
  );
  const chartData = dailyEntries.map(([dateKey, count]) => ({
    date: formatShortDate(dateKey),
    fullDate: dateKey,
    requests: count,
  }));
  const totalRecentRequests = chartData.reduce((sum, item) => sum + item.requests, 0);
  const hasTrendData = chartData.some(item => item.requests > 0);
  const statCards = [
    { label: 'Total Requests', value: formatNumber(stats?.totalRequests ?? 0), icon: TrendingUp, color: 'text-blue-500', sub: 'All-time request count' },
    { label: 'Today', value: formatNumber(stats?.todayRequests ?? 0), icon: Clock, color: 'text-indigo-500', sub: `${stats?.lastRequestAt ? new Date(stats.lastRequestAt).toLocaleDateString('zh-CN') : 'No data'}` },
    { label: 'Connected Sites', value: formatNumber(stats?.totalSites ?? 0), icon: Globe, color: 'text-cyan-500', sub: 'Source domains tracked' },
    { label: 'Total Images', value: formatNumber(stats?.totalImages ?? 0), icon: Layers, color: 'text-fuchsia-500', sub: `${stats?.tags?.length ?? 0} tags` },
  ];

  return (
    <section id="stats" className="relative z-10 py-16 px-4 sm:px-6 scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <div className="section-header animate-slide-up">
          <h2>Stats</h2>
          <p>API activity and gallery resource overview</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {statCards.map((card, i) => (
            <Card key={i} className="glass-strong rounded-2xl hover-lift">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-secondary/60 flex items-center justify-center">
                    <card.icon className={`w-4 h-4 ${card.color}`} />
                  </div>
                  <span className="text-xs text-muted-foreground">{card.label}</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{card.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="glass-strong rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium">7-day trend</span>
              </div>
              <span className="rounded-full bg-secondary/60 px-3 py-1 text-xs text-muted-foreground">
                Recent 7 days: {formatNumber(totalRecentRequests)}
              </span>
            </div>
            <div className="h-44">
              {hasTrendData ? (
                <ChartContainer
                  config={{
                    requests: {
                      label: 'Requests',
                      color: 'hsl(var(--primary))',
                    },
                  }}
                  className="h-full w-full"
                >
                  <AreaChart data={chartData} margin={{ left: 6, right: 8, top: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="requestsTrend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-requests)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--color-requests)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis width={32} tickLine={false} axisLine={false} allowDecimals={false} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" labelKey="fullDate" />} />
                    <Area
                      type="monotone"
                      dataKey="requests"
                      stroke="var(--color-requests)"
                      strokeWidth={2.5}
                      fill="url(#requestsTrend)"
                      dot={{ r: 3, strokeWidth: 2 }}
                      activeDot={{ r: 5 }}
                    />
                  </AreaChart>
                </ChartContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground/40">
                  <div className="text-center">
                    <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">No request data yet</p>
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
