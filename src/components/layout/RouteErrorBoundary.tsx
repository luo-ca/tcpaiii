import { Component, type ErrorInfo, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';

import { ErrorState } from '@/components/states/ErrorState';
import { isChunkLoadError, claimChunkReload } from '@/lib/chunk-error';

type RouteErrorBoundaryProps = {
  /** 变化即复位错误态 —— 换页时不带上一块的错误。 */
  resetKey: unknown;
  children: ReactNode;
};

type RouteErrorBoundaryState = {
  error: Error | null;
};

/**
 * 路由级错误边界。
 *
 * 存在的唯一理由：全站原先只有 RootErrorBoundary，它 catch 到任何子树抛错都
 * 用 innerHTML 把整页换成兜底 —— 一个 lazy chunk 404（部署换代后，旧页面点了
 * 没访问过的页签）就能把用户正在看的健康页面整个干掉。这里把爆炸半径收进
 * <main>：坏的那一块显示错误 UI，页头 / 页脚 / 地址栏全部保留。
 *
 * 三条关键行为：
 *  1. chunk 类错误在 componentDidCatch 里**自动刷新一次**（时间戳冷却闸门，
 *     15s 内最多一次）：刷新拿到新 index.html + 新资源，多数用户完全无感；
 *  2. 手动「重试」对 chunk 错误必须走 location.reload() —— React.lazy 会缓存
 *     **被拒绝的 promise**，复位边界只会拿同一份缓存 rejection 再炸一次，
 *     不刷新页面永远修不好；非 chunk 错误才复位；
 *  3. resetKey（当前路由）变化即清错误态：换页后上一块的失败不得扣留新页。
 */
export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    // 自动自愈：只有 chunk 错误、且冷却窗口允许时才刷新。
    // 闸门用时间戳而不是布尔量：刷新后若仍是坏部署，第二次的 ts 在窗口内，
    // 直接落回手动错误 UI —— 不会形成刷新循环。
    if (isChunkLoadError(error) && claimChunkReload()) {
      window.location.reload();
    }
  }

  componentDidUpdate(prevProps: RouteErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  /** public：手动重试路径需要可测（见 chunk-resilience.test）。 */
  handleRetry = () => {
    if (this.state.error && isChunkLoadError(this.state.error)) {
      // 用户点击驱动的刷新不参与冷却（不是循环风险）；而且如 doc 2 所述，
      // 对 chunk 错误这是**唯一**能再发起一次 import 的方式
      window.location.reload();
      return;
    }
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      const chunkError = isChunkLoadError(this.state.error);
      return (
        <div className="relative z-10 mx-auto max-w-6xl px-4 pb-24 pt-[calc(var(--header-h)+32px)] sm:px-6 sm:pb-28">
          <ErrorState
            icon={TriangleAlert}
            title={chunkError ? '页面资源已更新，加载失败' : '页面出错了'}
            message={
              chunkError
                ? '多半是刚部署过新版本：点「重新加载」即可取到最新资源。'
                : '这一块没能正常显示。可重试，或切换页面继续浏览。'
            }
            onRetry={this.handleRetry}
            retryLabel={chunkError ? '重新加载' : '重试'}
          />
        </div>
      );
    }

    return this.props.children;
  }
}
