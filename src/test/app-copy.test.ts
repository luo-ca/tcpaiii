import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const heroSource = readFileSync(resolve(process.cwd(), "src/components/sections/HeroSection.tsx"), "utf8");
const previewSource = readFileSync(resolve(process.cwd(), "src/components/sections/OnlinePreview.tsx"), "utf8");
const mainSource = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
const indexHtml = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const viteConfig = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");

describe("home page copy", () => {
  it("does not contain visible mojibake markers", () => {
    // Check that source files don't contain common mojibake patterns
    const mojibakePattern = /[锟斤拷闅娴鎮搴閿ͼ烫屯]/u;
    expect(appSource).not.toMatch(mojibakePattern);
    expect(heroSource).not.toMatch(mojibakePattern);
  });

  it("uses the anime API landing headline", () => {
    expect(heroSource).toContain("anime images");
    expect(heroSource).toContain("for anyone");
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

  it("does not load the console-blocking external script", () => {
    expect(indexHtml).not.toContain("https://static.paiii.cn/static/gbts.js");
    expect(indexHtml).not.toContain("disable-devtool-auto");
  });

  it("uses safe production tree shaking settings", () => {
    expect(viteConfig).toContain("treeshake: true");
    expect(viteConfig).not.toContain("moduleSideEffects: false");
  });
});
