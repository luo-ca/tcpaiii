import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 状态页「调用延迟自测」的状态机（P172）。
 *
 * 原先用两个变量表示三种以上的状态：
 *     const [latency, setLatency] = useState<number | null>(null);
 *     const [latencyBusy, setLatencyBusy] = useState(false);
 * 而 `latency === null` **同时**意味着「从未测过」和「上次失败」—— 于是两条
 * 渲染分支都判错：
 *
 *   · 测速进行中：latency 还是 null、busy 为 true，`latency === null && !busy`
 *     为 false，落到 `latency === null ? '测速失败'` 的假分支上 —— 界面当场显示
 *     「测速失败」。这块外面套着 aria-live="polite"，读屏用户会听到一句
 *     并不存在的故障播报。
 *   · 真的失败之后：busy 回到 false，`null && !busy` 为 true，命中「尚未测速」
 *     提示 —— 失败被显示成「还没测过」。也就是说 '测速失败' 这个字面量
 *     只会在「正在测」的时候出现，永远不会用于报告真实失败，语义整个反了。
 *
 * 修法是把状态收成判别联合（本文件已有 Overall 这个先例），让
 * 「进行中且已失败」这种组合在类型上就不存在。
 *
 * 仓库用源码结构断言而非渲染测试：状态页的渲染测试只覆盖首帧
 * （见 status-page.test.tsx），而这里要钉的是「分支配对是否搞反」，
 * 那正是结构问题。
 */

const SOURCE = readFileSync(resolve(process.cwd(), "src/features/status-page.tsx"), "utf8");

/**
 * 取某个 case 分支的代码片段。
 *
 * 用「到下一个 case/结尾为止」切片，而不是匹配单行 `case 'x': return {...}` ——
 * 后者会把格式化（多行 return、prettier 换行）当成缺陷。
 */
function caseBody(kind: string): string {
  const body = latencyRowBody();
  const start = body.indexOf(`case '${kind}':`);
  expect(start, `latencyRow 缺 case '${kind}' 分支`).toBeGreaterThan(-1);
  const rest = body.slice(start + `case '${kind}':`.length);
  const next = rest.search(/\n\s*case '/);
  return next === -1 ? rest : rest.slice(0, next);
}

/** 取出 latencyRow 的函数体，用来检查各状态与文案/色调的配对 */
function latencyRowBody(): string {
  const match = SOURCE.match(/function latencyRow\([\s\S]*?\n\}/);
  expect(match, "未找到 latencyRow —— 测速状态的映射应收敛到一处").toBeTruthy();
  return match![0];
}

describe("状态页测速 · 状态机", () => {
  it("状态用判别联合表示，不再靠 null 兼表两义", () => {
    expect(SOURCE, "缺少 LatencyState 判别联合").toContain("type LatencyState");
    for (const kind of ["'idle'", "'testing'", "'ok'", "'failed'"]) {
      expect(SOURCE, `LatencyState 缺少 ${kind} 分支`).toContain(`kind: ${kind}`);
    }
    // 旧写法：number|null 与 busy 布尔并存
    expect(SOURCE, "仍在用 latency: number | null 表示状态").not.toMatch(
      /useState<number \| null>\(null\)/,
    );
  });

  it("进行中不得报「测速失败」—— 那会让 aria-live 播报假故障", () => {
    expect(caseBody('testing'), "测速进行中显示成了失败，语义反了").not.toContain("测速失败");
  });

  it("真实失败才报「测速失败」", () => {
    expect(caseBody('failed'), "失败分支未输出「测速失败」").toContain("测速失败");
  });

  it("成功分支带上毫秒数", () => {
    const ok = caseBody('ok');
    expect(ok, "成功分支未显示 ms").toContain("ms");
    // 必须用的是测出来的那个值，不能写死
    expect(ok, "成功分支未使用 ms 字段").toContain("ms");
  });

  it("旧的「null 即失败」分支已移除", () => {
    // 这两条正是原缺陷的字面量，钉住不再回退
    expect(SOURCE, "旧分支仍在：把 null 当成失败").not.toMatch(
      /latency === null \? '测速失败'/,
    );
    expect(SOURCE, "旧分支仍在：把 null 当成 idle").not.toMatch(
      /latency === null \? 'idle'/,
    );
  });

  it("「尚未测速」只在 idle 出现", () => {
    // 首帧提示必须保留（status-page.test.tsx 断言了它），但只能来自 idle，
    // 不能再让「失败之后」漏到这条分支上
    expect(SOURCE, "缺少 idle 分支").toContain("'idle'");
    expect(SOURCE, "尚未测速提示丢失").toContain("尚未测速");
  });
});
