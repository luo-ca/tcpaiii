import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, sep as pathSep } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * .glass* 的 border 简写会吃掉同元素上的 Tailwind 边框色工具类。
 *
 * 背景（P23 实证）：`.glass` / `.glass-strong` / `.glass-card` 用
 * `border: 2px solid var(--color-ink)` 这条**简写**声明边框；它与 Tailwind 的
 * `border-<color>` 工具类同样落在 `@layer utilities`，在产物 CSS 中 glass 一族
 * 排在 Tailwind 工具类之后，二者特异性相同 —— 后出现的简写胜出，把边框颜色
 * 工具类盖成**永不生效的死类**。
 *
 * 这就是 `ErrorState` 外卡曾经挂了 `border-red-200` 却从不渲染红色的原因
 * （构建产物里 `.glass-strong` 位于 `.border-red-200` 之后）。设计上「容器中性
 * 克制」，错误的红色信号由内层图标容器承担，因此这里不是补优先级，而是禁止
 * 这类注定失效的组合再次出现。
 *
 * 注：background 同理（`.glass*` 的 `background: #ffffff` 会盖掉 bg-* 色），
 * 但当前 `--color-card` 就是纯白、无可见差异，暂不纳入断言，避免误伤。
 */
const GLASS = /\bglass(?:-strong|-card)?\b/;
const BORDER_COLOR =
  /\bborder-(?:red|green|blue|orange|amber|yellow|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|brand|iris|secondary|muted|accent|card|popover|white|black|input|border)\b/;

/**
 * 从一行里取出「参与类名判断」的字符串字面量。
 *
 * 与 design-utility-cascade.test.ts 的 literals() 同一口径：抓**全部**单/双引号
 * 与反引号字面量，而不是只认 `className=`。原因（P24 已验证过一次）：类名字符串
 * 还可能出现在 cn(...) 调用、返回类名模板串的辅助函数里，只认 `className=`
 * 会整类漏掉 —— 那些位置的违规组合会被判为「无冲突」而静默放过。
 *
 * 行内取字面量即可：调用方本就逐行扫描，跨行模板串的拼接片段仍会各自成串。
 */
function classStringsOf(line: string): string[] {
  const out: string[] = [];
  const re = /`[^`]*`|"[^"\n]*"|'[^'\n]*'/g;
  for (const m of line.matchAll(re)) out.push(m[0].slice(1, -1));
  return out;
}

describe("glass 族不得与边框色工具类同元素共存", () => {
  it("全站没有「glass + border-<色>」的死类组合", () => {
    // 排除测试自身目录。**不能用 f.includes("src/test")** —— walk() 产出的是
    // path.join() 拼的路径，Windows 上是反斜杠（…\src\test\…），那个子串
    // 在 Windows 上永远匹配不到，排除形同虚设。而这个文件自己就写了
    // 「glass-strong + border-red-200」这类反例字面量，于是它会被自己的规则
    // 判成违规。用绝对目录前缀比对，不靠分隔符风格。
    const testDir = resolve(process.cwd(), "src", "test") + pathSep;
    const scanned = walk(resolve(process.cwd(), "src")).filter((f) => !f.startsWith(testDir));
    // 防空跑：本测试会排除 src/test，而 src/test 占了源文件的六成以上 ——
    // 一旦 walk 的目录或扩展名匹配写错，剩下的集合可能直接为空，
    // 循环空转而 offenders 恒为 []，护栏静默失效。
    expect(
      scanned.length,
      "非测试源文件扫描集为空 —— walk() 或 src/test 排除逻辑把一切都滤掉了",
    ).toBeGreaterThan(20);
    // 排除必须**真的**生效：上面的 >20 只能拦住「排得太宽」，拦不住
    // 「排得太窄」（旧写法在 Windows 上就完全失效）。
    //
    // 判据刻意**不**复用上面的 testDir 表达式 —— 若两者共用同一个常量，
    // 常量写错时守卫会用同一根错针去查，什么也查不到（自证陷阱，实测踩过）。
    // 这里直接问「本文件在不在扫描集里」：它正是含反例字面量的那个文件，
    // 也是排除一旦失效第一个会假阳性的文件。不涉及任何分隔符判断。
    expect(
      scanned.filter((f) => resolve(f) === resolve(process.cwd(), "src/test/glass-cascade.test.ts")),
      "本测试文件未被排除 —— 排除条件在本次平台上失效了，它会用自身反例把自己判违规",
    ).toEqual([]);
    const offenders: string[] = [];
    for (const file of scanned) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) return;
        for (const cls of classStringsOf(line)) {
          if (GLASS.test(cls) && BORDER_COLOR.test(cls)) {
            offenders.push(`${file}:${index + 1}`);
          }
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("提取器能看见 cn(...) 与拼模板串里的类名（防止退化成只认 className=）", () => {
    // 旧实现用 /className=(?:\{`([^`]*)`\}|"([^"]*)"|'([^']*)')/ 提取，
    // 对下面三种写法全部返回空 —— 违规组合会被判成「无冲突」而静默放过：
    //   className={cn('glass-strong border-red-200')}
    //   const cls = `glass-strong border-red-200`
    //   <div className={`glass-strong ${extra}`}>
    // 这是真实漏检，不是理论：P24 给 design-utility-cascade 换通用提取器时
    // 已确认过「只认 className= 会漏掉 cn(...) 与辅助函数里的模板串」。
    const cnForm = "className={cn('glass-strong border-red-200')}";
    const tplForm = 'const cls = `glass-strong border-red-200`;';
    const plainForm = 'className="glass-strong border-red-200"';

    for (const [label, line] of [
      ["cn(...)", cnForm],
      ["模板串赋值", tplForm],
      ["普通 className", plainForm],
    ] as const) {
      const seen = classStringsOf(line);
      expect(
        seen.some((c) => GLASS.test(c) && BORDER_COLOR.test(c)),
        `${label} 里的违规组合没被提取出来：${JSON.stringify(seen)}`,
      ).toBe(true);
    }

    // 反向：注释行不该被当成类名（调用方逐行跳注释，这里只确保提取器本身不造字面量）
    expect(classStringsOf("// 注：.glass-strong 与 border-red-200 不共存"), "注释裸文本不该产生字面量").toEqual([]);
  });

  it("ErrorState 外卡保持中性：红色信号只在内层图标容器", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/states/ErrorState.tsx"),
      "utf8"
    );
    // 取该文件里所有字符串字面量（单/双引号与模板串都算），避开注释里的说明文字
    // —— 注释是裸文本、不在引号内，本就不会被当成字面量。
    const classes = src.split(/\r?\n/).flatMap(classStringsOf);
    const outer = classes.find((c) => GLASS.test(c)) ?? "";
    expect(outer).toContain("glass-strong");
    expect(outer).not.toMatch(/\bborder-(?:red|destructive)/);
    // P32 起红色信号改用语义色 token 梯度（曾为 border-red-200 + bg-red-50）
    expect(
      classes.some((c) => c.includes("border-destructive-line") && c.includes("bg-destructive-soft"))
    ).toBe(true);
  });
});
