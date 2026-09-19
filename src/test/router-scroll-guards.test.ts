import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const routerSource = readFileSync(resolve(process.cwd(), 'src/lib/router.ts'), 'utf8');
const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
const backToTopSource = readFileSync(
  resolve(process.cwd(), 'src/components/ui/back-to-top.tsx'),
  'utf8',
);

/**
 * P35：编程式滚动与软 404 的三道闸。
 * 这些是靠「源码里必须存在某个调用」固定的行为契约 ——
 * 谁把闸门拆了，测试就得跟着红，而不是悄悄退回旧行为。
 */
describe('router 与滚动的一致性闸门', () => {
  it('未知路径改写回首页，地址栏不再静默软 404', () => {
    expect(routerSource).toContain('window.history.replaceState(null,');
    expect(routerSource).toContain('已回到首页');
  });

  it('从未被 dispatch 的自定义导航事件不许复活', () => {
    // popstate 足够覆盖回退/前进；历史注释（App.tsx:103）说明它曾是广播桥，
    // 但如今没有任何派发方，监听器纯属死重
    expect(routerSource).not.toContain('paiii:navigate');
  });

  it('所有显式 smooth 滚动都过 prefersReducedMotion 闸门', () => {
    const corpus = [routerSource, appSource, backToTopSource].join('\n');
    // 裸的 `behavior: 'smooth'` 一旦出现在这三处，减动效偏好就被绕过
    expect(corpus).not.toMatch(/behavior:\s*'smooth'/);
    const gated = corpus.match(/behavior:\s*prefersReducedMotion\(\)\s*\?\s*'auto'\s*:\s*'smooth'/g) ?? [];
    // router 锚点滚动 / App 随机跳转 / back-to-top 至少各一处
    expect(gated.length).toBeGreaterThanOrEqual(3);
    // 回页顶用恒定 'auto' 是刻意设计（跳顶不该带平滑），只允许 router 这一处
    expect(corpus.match(/behavior:\s*'auto'/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });
});
