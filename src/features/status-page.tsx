import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  CircleAlert,
  CircleCheck,
  CircleX,
  Check,
  Clock,
  Copy,
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
import { useCopyFeedback } from '@/hooks/use-copy-feedback';
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

/** 构建版本常是 buildId 这类长串，卡片里只露前 8 位，完整值留在摘要里。 */
function shortBuildId(buildId: string): string {
  return buildId.length > 12 ? `${buildId.slice(0, 8)}…` : buildId;
}

/** 降级时给出具体缺哪个绑定，而不是笼统的「存储绑定不完整」。 */
function degradedNote(health: HealthPayload): string {
  const missing: string[] = [];
  if (!health.kv.imagesBound) missing.push('图库 (images)');
  if (!health.kv.statsBound) missing.push('统计 (stats)');
  return missing.length > 0
    ? `接口在跑，但 ${missing.join(' 与 ')} 未绑定，读写可能受影响。`
    : '接口在跑，但返回的健康标记异常。';
}

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
    // 标签页隐藏时停表（同 stats）：后台继续请求没有意义，而且定时器会被
    // 浏览器节流，回来时反而是一段不确定有多旧的结果。
    staleTime: 0,
    refetchInterval: () => (typeof document !== 'undefined' && document.hidden ? false : 30_000),
    // 切回标签页立即复检一次，接上停表期间的空白
    refetchOnWindowFocus: true,
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
      // 网络类原生错误的中文化已收口在 getErrorMessage（P131）：那里只映射
      // 「已知的网络文案」，其余错误原样透传。原先这里用 `instanceof TypeError`
      // 一刀切，会把真正的代码 TypeError（例如内部调用的 toLowerCase of undefined）
      // 也误报成「网络不可达」，掩盖真实故障。
      toast.error(`测速失败：${getErrorMessage(err, '测速请求失败')}`);
    } finally {
      setLatencyBusy(false);
    }
  }, []);

  const banner = overall.kind === 'loading' ? null : TONE_BANNER[overall.kind];
  const BannerIcon = banner?.icon;
  const copy = overall.kind === 'loading' ? null : BANNER_TEXT[overall.kind];

  /** 反馈问题用的一行摘要：总状态 + 关键字面值 + 可选延迟，够对方判断环境。 */
  const { copied: copiedSummary, copy: copySummary } = useCopyFeedback();

  const handleCopySummary = useCallback(() => {
    if (overall.kind === 'loading') return;
    const lines: string[] = [
      `派次元 API 状态：${BANNER_TEXT[overall.kind].title}`,
    ];
    if (overall.kind === 'down') {
      lines.push('健康检查：不可达（/api/health 请求失败）');
    } else {
      lines.push(`健康检查：响应正常`);
      lines.push(`运行时：${overall.health.runtime}`);
      lines.push(`构建版本：${overall.health.buildId}`);
      lines.push(
        `KV 绑定：图库 ${overall.health.kv.imagesBound ? '已绑定' : '未绑定'} / 统计 ${overall.health.kv.statsBound ? '已绑定' : '未绑定'}`,
      );
      lines.push(`接口时间：${overall.health.timestamp}`);
    }
    if (latency !== null) lines.push(`调用延迟：${latency} ms`);
    lines.push(`页面：${window.location.origin}`);
    void copySummary(lines.join('\n'), '状态摘要已复制');
  }, [copySummary, latency, overall]);

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
      {/* 状态横幅要能换行堆叠 —— 否则窄屏文字宽度会被挤到 0px。
          原先它是恒定单行 flex：图标 + 文本 + 右侧两个按钮（复制摘要 /
          重新检查，各 106px）都按 shrink-0 / nowrap 排在同一行，中间那段
          min-w-0 的文本块被挤到没地方。实测 280~340px 视口下文字宽度是
          0px，标题与说明各自被压成竖排单字、横幅整块撑到 326px 高
          （≈4 行按钮的高度），手机上看状态页第一屏几乎全是这条被压扁的横幅。
          flex-col + sm:flex-row：窄屏图标/文案一行、按钮换行到下一行；
          ≥640px 恢复原来的单行横排。修后实测同样视口文字宽 164~168px、
          横幅高降到 123px，标题与说明都完整可读。 */}
      {/*
        加载态横幅的高度必须与真实横幅一致（窄屏 123px、≥sm 79px）。
        原先这里是「p-6 + 两条 h-8/h-4 骨架」的通用卡，高 104px，
        而真实横幅 ≥sm 只有 79px —— 数据到达时这一块会缩短 25px，
        把下面的卡片与页脚一起上提（实测 /status 桌面端残留 CLS 0.0123）。
        用与真实横幅相同的高度定死，落地时高度不变。
      */}
      {overall.kind === 'loading' ? (
        <div className="mb-5 h-[123px] rounded-2xl skeleton-shimmer sm:h-[79px]" />
      ) : (
        <div
          role="status"
          aria-live="polite"
          className={`mb-5 flex flex-col gap-3 rounded-2xl border-2 px-5 py-4 sm:flex-row sm:items-center shadow-[4px_4px_0_0_var(--color-ink)] ${banner?.cls}`}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {BannerIcon && <BannerIcon className="h-7 w-7 shrink-0" aria-hidden="true" />}
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight">{copy?.title}</p>
              <p className="text-sm opacity-80">
                {overall.kind === 'degraded' ? degradedNote(overall.health) : copy?.note}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:ml-auto">
            {/* 反馈问题时一键带上环境信息，省掉「你那边什么版本/什么绑定」的来回 */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-xl bg-white/70 text-xs"
              onClick={handleCopySummary}
            >
              {copiedSummary ? (
                <Check className="mr-1.5 h-3.5 w-3.5 text-success-ink" aria-hidden="true" />
              ) : (
                <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              )}
              {copiedSummary ? '已复制' : '复制摘要'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-xl bg-white/70 text-xs"
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
                <CheckRow
                  icon={Clock}
                  label="构建版本"
                  tone="idle"
                  value={shortBuildId(overall.health.buildId)}
                />
              </>
            )}
          </CardContent>
        </Card>

        <Card className="glass-strong rounded-2xl">
          <CardContent className="space-y-3.5 p-5">
            <h2 className="text-sm font-bold text-foreground">存储绑定</h2>
            {overall.kind === 'loading' ? (
              <ServiceSkeleton rows={2} />
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
                  请求一次 /api/random，测边缘函数的首跳响应耗时（不跟随 302 跳转）。
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

/**
 * 卡片内的加载骨架。
 *
 * `rows` 必须与真实内容的行数一致：「服务」卡是 3 行（健康检查 / 运行时 /
 * 构建版本），「存储绑定」卡只有 2 行（图库 / 统计）。原先固定渲染 3 行，
 * 存储绑定卡在数据到达时会缩短一整行（-12px），把下面的卡片与页脚一起上移 ——
 * 实测 /status 首屏因此产生 0.0157 的 CLS。
 */
function ServiceSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-5 w-full rounded skeleton-shimmer" />
      ))}
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
