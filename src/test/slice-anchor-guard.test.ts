import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 用「注释文本」当切片锚点时必须守卫（P191）。
 *
 * 这类测试靠 indexOf 定位源码里的一段再断言。用注释当锚点本身可以接受
 * （注释是写给下一位读者的，通常比标识符稳定），但**结束锚点丢了会 fail-open**：
 *
 *   const end = SRC.indexOf("// ---- Gallery API ----");   // 若注释被删 -> -1
 *   SRC.slice(start, end)                                  // = slice(start, -1)
 *
 * slice 的负索引是「从末尾倒数」而不是「空」—— 结果是把整段延伸到文件末尾。
 * 断言于是在**错误的范围**上通过：可能整段落到了另一个函数上，也可能因为
 * 范围变宽而碰巧包含了要找的字符串。测试全绿，覆盖已经失效。
 *
 * 真出过事：poll-pause-when-hidden.test.ts 的 statsQueryOptions / health
 * 两处结束锚点都没守卫，注释一旦被改，refetchOnWindowFocus 的断言就退化成
 * 「文件里任何地方有这行就行」。同仓库的 lightbox-pending-unlock.test.ts
 * 反而是正确示范（把 effectEnd 与 effectStart 做了大小比较）。
 *
 * 起点锚点（slice(start, X)）丢锚点时 start = -1，会在别处误命中，同样危险，
 * 所以本测试对起点、结束一视同仁：用了注释锚点就必须有守卫。
 */

const TEST_DIR = resolve(process.cwd(), "src/test");

/** 形如 indexOf("...//...") / indexOf(".../*...") / indexOf("... * ...") 的注释锚点参数 */
function isCommentAnchorArg(arg: string): boolean {
  return arg.includes("//") || arg.includes("/*") || / \* /.test(arg);
}

/** 找出源码里所有「注释文本」锚点的参数 */
function commentAnchorArgs(src: string): string[] {
  const out: string[] = [];
  const re = /indexOf\(\s*(["'`])([\s\S]*?)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (isCommentAnchorArg(m[2])) out.push(m[2]);
  }
  return out;
}

/** 变量形式的注释锚点：const X = <expr>.indexOf("<注释标记参数>") */
function commentAnchorVars(src: string): string[] {
  const names: string[] = [];
  const re = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*?\.indexOf\(\s*(["'`])([\s\S]*?)\2/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (isCommentAnchorArg(m[3])) names.push(m[1]);
  }
  return names;
}

/** 内联注释锚点：同一行里先出现 .slice(，其后又有注释锚点参数 —— 没有变量可守 */
function hasInlineCommentAnchor(src: string): boolean {
  for (const line of src.split(/\r?\n/)) {
    const sliceIdx = line.indexOf(".slice(");
    if (sliceIdx === -1) continue;
    // 引号奇偶：.slice( 之前若有落单的引号，说明它在字符串字面量里
    // （本文件的样本就是这个形态），不是真的调用。
    const before = line.slice(0, sliceIdx);
    const sq = (before.match(/'/g) || []).length;
    const dq = (before.match(/"/g) || []).length;
    if (sq % 2 === 1 || dq % 2 === 1) continue;
    const rest = line.slice(sliceIdx);
    const re = /indexOf\(\s*(["'`])([\s\S]*?)\1/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(rest))) {
      if (isCommentAnchorArg(m[2])) return true;
    }
  }
  return false;
}

/** 该变量是否被守卫：出现在一条 expect(<var>...).toBeGreaterThan(...) 里 */
function isVarGuarded(src: string, name: string): boolean {
  const esc = name.replace(/\$/g, "\\$");
  return new RegExp(`expect\\([^)]*\\b${esc}\\b[^)]*\\)[^;]*toBeGreaterThan\\(`).test(src);
}

function unguardedCommentAnchors(src: string): string[] {
  return commentAnchorVars(src).filter((name) => {
    const usedAsBound = new RegExp(`\\.slice\\([^)]*\\b${name.replace(/\$/g, "\\$")}\\b`).test(src);
    if (!usedAsBound) return false;
    return !isVarGuarded(src, name);
  });
}

describe("切片锚点必须守卫 · 注释锚点（P191）", () => {
  it("用注释文本当锚点的测试文件都必须有守卫", () => {
    const offenders: string[] = [];

    for (const f of readdirSync(TEST_DIR).filter((x) => /\.test\.tsx?$/.test(x))) {
      // 本文件自身包含「坏样本」字符串字面量用于反向验证，会被规则误判为真锚点，
      // 故排除；规则本身的正确性由下面两条自检用例单独负责。
      if (f === "slice-anchor-guard.test.ts") continue;
      const src = readFileSync(join(TEST_DIR, f), "utf8");
      if (!commentAnchorArgs(src).length) continue;

      const unguarded = unguardedCommentAnchors(src);
      const inline = hasInlineCommentAnchor(src);
      if (unguarded.length || inline) {
        offenders.push(`${f}: unguardedVars=[${unguarded.join(",")}] inlineAnchor=${inline}`);
      }
    }

    expect(
      offenders,
      `用注释文本当切片锚点但没有守卫（结束锚点丢了会 fail-open，切片延伸到文件末尾）：\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("仓库里现存的注释锚点确实都被认出来了（防止规则静默失效）", () => {
    // poll-pause-when-hidden.test.ts 的两处：statsQueryOptions 结束锚点、health 结束锚点
    const poll = readFileSync(join(TEST_DIR, "poll-pause-when-hidden.test.ts"), "utf8");
    const vars = commentAnchorVars(poll);
    expect(vars.length, "没认出 poll-pause 的注释锚点变量").toBeGreaterThan(0);
    expect(unguardedCommentAnchors(poll), "守卫没被认出来").toEqual([]);
  });

  it("规则自身能咬住：人工样本必须被判定为违规", () => {
    // 变量形式、未守卫
    const badVar = [
      'const end = SRC.indexOf("// 结束锚");',
      "const x = SRC.slice(start, end);",
    ].join("\n");
    expect(commentAnchorVars(badVar), "没认出变量注释锚点").toEqual(["end"]);
    expect(unguardedCommentAnchors(badVar), "未守卫的变量锚点没被报出").toEqual(["end"]);

    // 内联形式、未守卫
    const badInline = 'const b = SRC.slice(SRC.indexOf("start"), SRC.indexOf("// 结束锚"));';
    expect(hasInlineCommentAnchor(badInline), "没认出内联注释锚点").toBe(true);

    // 有守卫：必须放过（相对顺序比较也算守卫）
    const goodVar = [
      'const end = SRC.indexOf("// 结束锚");',
      'expect(end, "找不到结束锚").toBeGreaterThan(start);',
      "const x = SRC.slice(start, end);",
    ].join("\n");
    expect(unguardedCommentAnchors(goodVar), "有守卫的样本被误报").toEqual([]);

    // 代码锚点（参数不含注释标记）不该被当成注释锚点
    const codeAnchor = 'const end = SRC.indexOf("</DialogTitle>");\nSRC.slice(start, end);';
    expect(commentAnchorVars(codeAnchor), "把代码锚点误判成注释锚点").toEqual([]);
    expect(commentAnchorArgs(codeAnchor), "代码锚点不该进注释锚点列表").toEqual([]);
  });
});
