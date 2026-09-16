import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * 组件基础类与调用处 className 的合并语义。
 *
 * 背景：`cn()` 是 `twMerge(clsx(...))` —— 同一冲突组里**靠后的胜出**，
 * 所以「基础类的默认值 + 调用处的覆盖」是可靠的，不需要在 CSS 里争顺序。
 *
 * 但有一个前提：两者必须落在**同一个变体组**。
 * 基础类写 `sm:rounded-lg`、调用处写 `rounded-2xl` 时，twMerge 认为它们不冲突，
 * 两个类会同时留在元素上，谁赢改由 Tailwind 的输出顺序决定 ——
 * 而 Tailwind v4 按主题键字母序输出，`rounded-lg` 恒排在 `rounded-2xl` 之后，
 * 于是桌面端被压回 12px。这就是 P9 真正坏掉的那处（弹窗）。
 *
 * 这两条断言分别守住上面两件事。
 */
describe("cn / twMerge 的圆角合并语义", () => {
  it("调用处的圆角覆盖基础类（同变体组）", () => {
    expect(cn("rounded-lg border", "rounded-2xl")).toBe("border rounded-2xl");
    expect(cn("rounded-lg", "rounded-full")).toBe("rounded-full");
    expect(cn("rounded-lg", "rounded-xl")).toBe("rounded-xl");
    expect(cn("rounded-lg", "rounded-md")).toBe("rounded-md");
  });

  it("Button 各尺寸的默认圆角，以及被覆盖时只留其一", () => {
    expect(cn(buttonVariants({ size: "sm" }))).toContain("rounded-md");
    expect(cn(buttonVariants({ size: "default" }))).toContain("rounded-lg");

    const pill = cn(buttonVariants({ size: "sm", className: "rounded-full" }));
    expect(pill).toContain("rounded-full");
    expect(pill).not.toContain("rounded-md");

    const cta = cn(buttonVariants({ size: "sm", className: "rounded-xl" }));
    expect(cta).toContain("rounded-xl");
    expect(cta).not.toContain("rounded-md");
  });

  /**
   * 变体是这里的雷：基础类一旦写成 `sm:rounded-*`，
   * twMerge 就再也合并不掉它，覆盖会静默失效。
   */
  it("组件基础类不得用响应式变体写默认圆角", () => {
    const files = walk(resolve(process.cwd(), "src"));
    const offenders: string[] = [];

    for (const file of files) {
      if (file.includes("__probe")) continue;
      const source = readFileSync(file, "utf8");
      const lines = source.split(/\r?\n/);
      lines.forEach((line, index) => {
        // 跳过注释行（说明性文字里会提到这个写法）
        const trimmed = line.trim();
        if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) return;
        if (/\bsm:rounded/.test(line)) offenders.push(`${file}:${index + 1}`);
      });
    }

    expect(offenders).toEqual([]);
  });
});
