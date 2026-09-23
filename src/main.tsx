import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import App from "./App.tsx";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const rootElement = document.getElementById("root");

function renderFallback(error: unknown) {
  if (!rootElement) return;

  const message = error instanceof Error && error.message ? error.message : "未知错误";
  rootElement.innerHTML = `
    <main style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f8f7f3;color:#15171f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <section style="max-width:560px;width:100%;border:2px solid #15171f;border-radius:20px;background:#ffffff;padding:28px;box-shadow:6px 6px 0 0 #15171f;">
        <p style="margin:0 0 8px;color:#007AFF;font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">派次元 API</p>
        <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;">页面加载失败</h1>
        <p style="margin:0 0 18px;color:#5c5b54;line-height:1.7;">页面脚本运行时出现异常，已显示兜底内容以避免白屏。请刷新页面，或稍后重试。</p>
        <pre style="white-space:pre-wrap;word-break:break-word;margin:0 0 18px;border-radius:12px;background:#15171f;color:#e2e1d8;padding:14px;font-size:12px;line-height:1.6;">${message.replace(/[<>&]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[char] ?? char))}</pre>
        <button onclick="location.reload()" style="height:40px;border:2px solid #15171f;border-radius:999px;background:#007AFF;color:#ffffff;padding:0 18px;font-weight:700;cursor:pointer;">刷新页面</button>
      </section>
    </main>
  `;
}

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

class RootErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    if (rootElement) {
      renderFallback(error);
    }
  }

  render() {
    if (this.state.error) {
      return null;
    }

    return this.props.children;
  }
}

try {
  if (!rootElement) {
    throw new Error("Root element #root was not found");
  }

  createRoot(rootElement).render(
    <RootErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster
          position="top-center"
          theme="light"
          toastOptions={{
            style: {
              // 与全站「墨线贴纸」语言一致：实色白底 + 2px 墨线 + 硬投影。
              // P15/P16 清玻璃拟态时只扫了组件目录，漏掉入口层这块 backdrop-filter，
              // P21 补齐 —— 全站不再有任何半透明模糊。
              background: "#ffffff",
              border: "2px solid #15171f",
              borderRadius: "12px",
              color: "#15171f",
              boxShadow: "4px 4px 0 0 #15171f",
            },
          }}
        />
      </QueryClientProvider>
    </RootErrorBoundary>
  );
} catch (error) {
  renderFallback(error);
}
