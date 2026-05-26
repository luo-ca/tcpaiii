import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const mainSource = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
const indexHtml = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

describe("home page copy", () => {
  it("does not contain visible mojibake markers", () => {
    expect(appSource).not.toMatch(/[�闅娴鎮搴閿ͼ]/u);
  });

  it("uses the anime API landing headline", () => {
    expect(appSource).toContain("anime images for anyone");
    expect(appSource).toContain("热门二次元图片");
  });

  it("renders a fallback shell when the React app crashes", () => {
    expect(mainSource).toContain("try {");
    expect(mainSource).toContain("页面加载失败");
    expect(mainSource).toContain("rootElement.innerHTML");
  });

  it("imports icons and components used by the redesigned landing page", () => {
    expect(appSource).toContain("import { Badge } from '@/components/ui/badge';");
    expect(appSource).toContain("import { Input } from '@/components/ui/input';");
    expect(appSource).toMatch(/\bSearch,\n\s+TrendingUp,/);
  });

  it("does not load the console-blocking external script", () => {
    expect(indexHtml).not.toContain("https://static.paiii.cn/static/gbts.js");
    expect(indexHtml).not.toContain("disable-devtool-auto");
  });
});
