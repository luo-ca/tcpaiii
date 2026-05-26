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
    <main style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f8fafc;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <section style="max-width:560px;width:100%;border:1px solid #e2e8f0;border-radius:24px;background:white;padding:28px;box-shadow:0 24px 80px rgba(15,23,42,.10);">
        <p style="margin:0 0 8px;color:#2563eb;font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">PaiCiYuan API</p>
        <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;">页面加载失败</h1>
        <p style="margin:0 0 18px;color:#475569;line-height:1.7;">页面脚本运行时出现异常，已显示兜底内容以避免白屏。请刷新页面，或稍后重试。</p>
        <pre style="white-space:pre-wrap;word-break:break-word;margin:0 0 18px;border-radius:14px;background:#0f172a;color:#e2e8f0;padding:14px;font-size:12px;line-height:1.6;">${message.replace(/[<>&]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[char] ?? char))}</pre>
        <button onclick="location.reload()" style="height:40px;border:0;border-radius:999px;background:#2563eb;color:white;padding:0 18px;font-weight:700;cursor:pointer;">刷新页面</button>
      </section>
    </main>
  `;
}

try {
  if (!rootElement) {
    throw new Error("Root element #root was not found");
  }

  createRoot(rootElement).render(
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster
        position="top-center"
        theme="light"
        toastOptions={{
          style: {
            background: "rgba(255,255,255,0.9)",
            backdropFilter: "saturate(180%) blur(20px)",
            border: "1px solid rgba(255,255,255,0.64)",
            color: "hsl(240 10% 3.9%)",
            boxShadow: "0 16px 48px rgba(15,23,42,0.12)",
          },
        }}
      />
    </QueryClientProvider>
  );
} catch (error) {
  renderFallback(error);
}
