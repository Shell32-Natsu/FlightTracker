import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { DEMO } from "./lib/env";
import "@fontsource-variable/inter";
import "./styles.css";

// 演示版是纯静态托管（GitHub Pages），没有服务端回退到 index.html，
// 用 #/flights 这样的哈希路由，浏览器返回和 iOS 侧滑返回照常可用
const Router = DEMO ? HashRouter : BrowserRouter;

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router>
        <App />
      </Router>
    </QueryClientProvider>
  </StrictMode>,
);
