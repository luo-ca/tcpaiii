import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock,
  Gauge,
  RefreshCw,
  Server,
  TriangleAlert,
  WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';

import type { HealthPayload } from '@/lib/types';
import { fetchHealth, measureRandomLatency } from '@/lib/api';
import { getErrorMessage } from '@/lib/helpers';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

// ============================================================
// Status types
// ============================================================

type Tone = 'ok' | 'warn' | 'bad' | 'idle';

/**
 * 把「服务到底活着没」这个判断收敛成一处：读 /api/health 的结果 + 网络可达性，
 * 推导一个总状态。状态页的每一块展示（横幅、逐项卡）都基于它，避免各处各写
 * 一套判断逻辑而分叉。
 */
type Overall =
  | { kind: 'loading' }
  | { kind: 'down' }
  | { kind: 'degraded'; health: HealthPayload }
  | { kind: 'ok'; health: HealthPayload };

function deriveOverall(
  isLoading: boolean,
  isError: boolean,
  health: HealthPayload | undefined,
): Overall {
  if (isLoading && !health) return { kind: 'loading' };
  if (isError || !health) return { kind: 'down' };
  const bound = health.kv.imagesBound && health.kv.statsBound;
  return bound && health.ok ? { kind: 'ok', health } : { kind: 'degraded', health };
}

// ============================================================
// Reusable bits
// ============================================================

const TONE_BANNER: Record<Exclude<Overall['kind'], 'loading'>, { cls: string; icon: typeof Activity }> = {
  ok: {
    cls: 'bg-success-soft border-success-line text-success-ink',
    icon: CircleCheck,
  },
  degraded: {
    cls: 'bg-warning-soft border-warning-line text-warning-ink',
    icon: TriangleAlert,
  },
  down: {
    cls: 'bg-destructive-soft border-destructive-line text-destructive-ink',
    icon: WifiOff,
  },
};

const BANNER_TEXT: Record<Exclude<Overall['kind'], 'loading'>, { title: string; note: string }> = {
  ok: { title: '服务正常', note: '接口可达，存储绑定齐全。' },
  degraded: { title: '部分降级', note: '接口在跑，但存储绑定不完整，读写可能受影响。' },
  down: { title: '服务不可用', note: '健康检查请求失败：可能网络中断或服务未部署。' },
};

/**
 * 单个检查项：一行「图标 + 名称 + 状态」。状态色只作用在值上，容器保持中性墨线，
 * 与全站贴纸卡一致（错误/警告的彩色信号集中在小徽标，不铺满整卡）。
 */
function CheckRow({
  icon: Icon,
  label,
  tone,
  value,
}: {
  icon: typeof Activity;
  label: string;
  tone: Tone;
  value: string;
}) {
  const pill: Record<Tone, { cls: string; icon: typeof Activity }> = {
    ok: { cls: 'text-success-ink', icon: CircleCheck },
    warn: { cls: 'text-warning-ink', icon: CircleAlert },
    bad: { cls: 'text-destructive-ink', icon: CircleX },
    idle: { cls: 'text-muted-foreground', icon: CircleAlert },
  };
  const { cls, icon: PillIcon } = pill[tone];
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </span>
      <span className={`flex shrink-0 items-center gap-1 text-sm font-semibold ${cls}`}>
        <PillIcon className="h-4 w-4" aria-hidden="true" />
        <span className="max-w-[10rem] truncate">{value}</span>
      </span>
    </div>
  );
}

function latencyTone(ms: number): Tone {
  if (ms < 300) return 'ok';
  if (ms < 800) return 'warn';
  return 'bad';
}

// ============================================================
// Status Page
// ============================================================

export default function StatusPage() {
  const healthQuery = useQuery<HealthPayload>({
    queryKey: ['health'],
    queryFn: fetchHealth,
    // 状态页的本职是「此刻是否可用」：破缓、且每 30s 自动复检一次。
    // 后端 health 分支不写 KV、也不计入 stats，轮询不消耗调用量。
    staleTime: 0,
    refetchInterval: 30_000,
    retry: 1,
  });

  const overall = deriveOverall(
    healthQuery.isLoading,
    healthQuery.isError,
    healthQuery.data,
  );

  const [latency, setLatency] = useState<number | null>(null);
  const [latencyBusy, setLatencyBusy] = useState(false);

  const runLatencyTest = useCallback(async () => {
    setLatencyBusy(true);
    try {
      const ms = await measureRandomLatency();
      setLatency(ms);
    } catch (err) {
      setLatency(null);
      // fetch 网络层失败抛的是浏览器原生英文 TypeError: Failed to fetch ——
      // 原样 toast 等于没解释，统一换成中文；后端返回的异常状态仍透传原文
      if (err instanceof TypeError) {
        toast.error('测速失败：网络请求未能送达接口（连接中断或服务不可达）');
      } else {
        toast.error(getErrorMessage(err, '测速请求失败'));
      }
    } finally {
      setLatencyBusy(false);
    }
  }, []);

  const banner = overall.kind === 'loading' ? null : TONE_BANNER[overall.kind];
  const BannerIcon = banner?.icon;
  const copy = overall.kind === 'loading' ? null : BANNER_TEXT[overall.kind];

  return (
    <div className="relative z-10 mx-auto max-w-4xl px-4 pb-24 pt-[calc(var(--header-h)+32px)] sm:px-6 sm:pb-28">
      {/* Page Header */}
      <div className="mb-7">
        <p className="section-eyebrow">
          <Activity className="h-3.5 w-3.5" aria-hidden="true" />
          服务状态
        </p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">运行状况</h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          实时健康检查、存储绑定与调用延迟自测 —— 接口是否可用，这里一目了然。
        </p>
      </div>

      {/* Overall banner */}
      {overall.kind === 'loading' ? (
        <Card className="glass-strong mb-5 rounded-2xl">
          <CardContent className="p-6">
            <div className="h-8 w-48 rounded-lg skeleton-shimmer" />
            <div className="mt-2 h-4 w-72 rounded-lg skeleton-shimmer" />
          </CardContent>
        </Card>
      ) : (
        <div
          role="status"
          aria-live="polite"
          className={`mb-5 flex items-center gap-3 rounded-2xl border-2 px-5 py-4 shadow-[4px_4px_0_0_var(--color-ink)] ${banner?.cls}`}
        >
          {BannerIcon && <BannerIcon className="h-7 w-7 shrink-0" aria-hidden="true" />}
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight">{copy?.title}</p>
            <p className="text-sm opacity-80">{copy?.note}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-8 shrink-0 rounded-xl bg-white/70 text-xs"
            onClick={() => void healthQuery.refetch()}
            disabled={healthQuery.isFetching}
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${healthQuery.isFetching ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            重新检查
          </Button>
        </div>
      )}

      {/* Detail cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="glass-strong rounded-2xl">
          <CardContent className="space-y-3.5 p-5">
            <h2 className="text-sm font-bold text-foreground">服务</h2>
            {overall.kind === 'loading' ? (
              <ServiceSkeleton />
            ) : overall.kind === 'down' ? (
              <>
                <CheckRow icon={Activity} label="健康检查" tone="bad" value="不可达" />
                <CheckRow icon={Gauge} label="运行时" tone="idle" value="—" />
              </>
            ) : (
              <>
                <CheckRow icon={Activity} label="健康检查" tone="ok" value="响应正常" />
                <CheckRow icon={Server} label="运行时" tone="idle" value={overall.health.runtime} />
                <CheckRow icon={Clock} label="构建版本" tone="idle" value={overall.health.buildId} />
              </>
            )}
          </CardContent>
        </Card>

        <Card className="glass-strong rounded-2xl">
          <CardContent className="space-y-3.5 p-5">
            <h2 className="text-sm font-bold text-foreground">存储绑定</h2>
            {overall.kind === 'loading' ? (
              <ServiceSkeleton />
            ) : (
              <>
                <CheckRow
                  icon={Server}
                  label="图库 (images)"
                  tone={boundTone(overall)}
                  value={boundLabel(overall, 'imagesBound')}
                />
                <CheckRow
                  icon={Server}
                  label="统计 (stats)"
                  tone={boundTone(overall)}
                  value={boundLabel(overall, 'statsBound')}
                />
              </>
            )}
          </CardContent>
        </Card>

        <Card className="glass-strong rounded-2xl sm:col-span-2">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-foreground">调用延迟自测</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  走你实际接入的方式请求一次 /api/random（含 302 跳转），测端到端响应头耗时。
                </p>
              </div>
              <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs" onClick={() => void runLatencyTest()} disabled={latencyBusy}>
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${latencyBusy ? 'animate-spin' : ''}`} aria-hidden="true" />
                {latencyBusy ? '测速中…' : '开始测速'}
              </Button>
            </div>
            <div className="mt-3" aria-live="polite">
              {latency === null && !latencyBusy ? (
                <p className="text-sm text-muted-foreground">尚未测速。点「开始测速」测一次当前网络下的真实延迟。</p>
              ) : (
                <CheckRow
                  icon={Gauge}
                  label="最近一次 /api/random"
                  tone={latency === null ? 'idle' : latencyTone(latency)}
                  value={latency === null ? '测速失败' : `${latency} ms`}
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {healthQuery.data && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          数据每 30 秒自动复检 · 上次检查{' '}
          {new Date(healthQuery.data.timestamp).toLocaleTimeString('zh-CN')}
        </p>
      )}
    </div>
  );
}

function ServiceSkeleton() {
  return (
    <div className="space-y-3.5">
      <div className="h-4 w-full rounded skeleton-shimmer" />
      <div className="h-4 w-full rounded skeleton-shimmer" />
      <div className="h-4 w-2/3 rounded skeleton-shimmer" />
    </div>
  );
}

function boundTone(overall: Overall): Tone {
  if (overall.kind !== 'ok' && overall.kind !== 'degraded') return 'idle';
  const { imagesBound, statsBound } = overall.health.kv;
  return imagesBound && statsBound ? 'ok' : 'warn';
}

function boundLabel(overall: Overall, key: 'imagesBound' | 'statsBound'): string {
  if (overall.kind !== 'ok' && overall.kind !== 'degraded') return '—';
  return overall.health.kv[key] ? '已绑定' : '未绑定';
}
