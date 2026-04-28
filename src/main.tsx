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

createRoot(document.getElementById("root")!).render(
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
