import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const heroSource = readFileSync(resolve(process.cwd(), "src/components/sections/HeroSection.tsx"), "utf8");
const previewSource = readFileSync(resolve(process.cwd(), "src/components/sections/OnlinePreview.tsx"), "utf8");
const mainSource = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
const indexHtml = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const viteConfig = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");
const apiSource = readFileSync(resolve(process.cwd(), "src/lib/api.ts"), "utf8");
const constantsSource = readFileSync(resolve(process.cwd(), "src/lib/constants.ts"), "utf8");

describe("home page copy", () => {
  it("does not contain visible mojibake markers", () => {
    // Check that source files don't contain common mojibake patterns
    const mojibakePattern = /[锟斤拷闅娴鎮搴閿ͼ烫屯]/u;
    expect(appSource).not.toMatch(mojibakePattern);
    expect(heroSource).not.toMatch(mojibakePattern);
  });

  it("uses the Chinese anime API landing headline", () => {
    // H1 is now Chinese: \u4E8C\u6B21\u5143\u56FE\u7247 = "anime images", \u4EBA\u4EBA\u53EF\u7528 = "for anyone"
    expect(heroSource).toContain("\u4E8C\u6B21\u5143\u56FE\u7247");
    expect(heroSource).toContain("\u4EBA\u4EBA\u53EF\u7528");
    expect(previewSource).toContain("\u70ED\u95E8\u4E8C\u6B21\u5143\u56FE\u7247");
  });

  it("renders a fallback shell when the React app crashes", () => {
    expect(mainSource).toContain("try {");
    expect(mainSource).toContain("\u9875\u9762\u52A0\u8F7D\u5931\u8D25");
    expect(mainSource).toContain("rootElement.innerHTML");
    expect(mainSource).toContain("RootErrorBoundary");
    expect(indexHtml).toContain("\u9875\u9762\u6B63\u5728\u52A0\u8F7D");
  });

  it("imports icons and components used by the redesigned landing page", () => {
    expect(heroSource).toContain("import { Input } from '@/components/ui/input';");
    expect(heroSource).toContain("Search");
    expect(heroSource).toContain("TrendingUp");
    expect(previewSource).toContain("import { Badge } from '@/components/ui/badge';");
  });

  it("loads the WAF anti-debug script from the imgs CDN", () => {
    // The WAF / anti-debug script is intentionally served from the imgs CDN
    // (added in 2bafea3). Guard that it stays on imgs and that the old
    // console-blocking static.paiii.cn copy never comes back.
    expect(indexHtml).toContain("https://imgs.paiii.cn/waf/gbts.js");
    expect(indexHtml).not.toContain("https://static.paiii.cn/static/gbts.js");
  });

  it("uses safe production tree shaking settings", () => {
    expect(viteConfig).toContain("treeshake: true");
    expect(viteConfig).not.toContain("moduleSideEffects: false");
  });

  it("serves the logo from the imgs CDN domain", () => {
    expect(constantsSource).toContain("https://imgs.paiii.cn/logo.svg");
    expect(constantsSource).not.toContain("https://static.paiii.cn/logo.svg");
    expect(indexHtml).toContain("https://imgs.paiii.cn/logo.svg");
    expect(indexHtml).not.toContain("https://static.paiii.cn/logo.svg");
  });

  it("keeps first paint independent of the random-image API", () => {
    // Hero must never hit /api/random: that consumes quota and pollutes
    // /api/stats (totalRequests, dailyRequests, and even the sites map).
    expect(heroSource).not.toContain("fetchRandomImage");
    // Its visual comes from the stat-free list endpoint instead.
    expect(heroSource).toContain("fetchImagesPage");
    // Broken images must not leave a broken <img> on first paint.
    expect(heroSource).toContain("handleHeroImageError");
    // The never-throwing fallback helper had zero callers (every surface
    // renders its own empty/error state now) — keep it dead for good.
    expect(apiSource).not.toContain("fetchRandomImageWithFallback");
  });
});
