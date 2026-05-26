import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const mainSource = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");

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

  it("does not use the API endpoint as the only hero background image", () => {
    expect(appSource).not.toContain("const heroImageUrl = buildAppUrl('/api/random')");
    expect(appSource).toContain("HERO_FALLBACK_IMAGE_URL");
  });
});
