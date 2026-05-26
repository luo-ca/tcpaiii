# Debug Session: blank-screen-load

Status: [OPEN]

## Symptom
网页打开时出现白屏，可能影响用户正常访问。

## Constraints
- 证据收集前不修改业务逻辑。
- 终端命令使用 UTF-8 输出。
- 先检查浏览器控制台、网络请求、HTML 结构、CSS 加载、关键渲染路径。

## Hypotheses
1. React 首屏运行时出现 JavaScript 异常，导致根组件未挂载或渲染中断。
2. 首页 Hero 使用 `/api/random` 作为背景图，返回 302 或预览鉴权参数缺失导致资源失败，但错误处理不足造成视觉白屏。
3. 新增 `CustomEvent` / `event instanceof CustomEvent` 在某些浏览器或测试环境中触发兼容性问题，导致渲染失败。
4. 构建产物 HTML、JS、CSS 路径或加载顺序异常，导致脚本或样式未正常加载。
5. Tailwind 任意值或 CSS 语法在构建后产物中异常，导致首屏内容不可见或被遮挡。

## Evidence Log
- Dev server started successfully at `http://127.0.0.1:5173/`.
- Playwright browser automation could not start because local Playwright browsers are not installed. Attempted install was stopped due to long-running package installation.
- `npm run build` passed, so TypeScript function build and Vite production bundling are not failing.
- `npm test` passed, so existing API tests and app copy tests do not reproduce a compile-time failure.
- Production `dist/index.html` contains `<div id="root"></div>`, module script `/assets/index-XcoXT83B.js`, CSS `/assets/index-D-xZMAH6.css`, and all referenced dist assets exist.
- HTTP GET `/` on dev server returns HTML 200.
- HTTP GET `/src/main.tsx` returns transformed module 200.
- HTTP GET `/api/random?format=json` on plain Vite dev server returns HTML 200, not JSON. This confirms dev mode without EdgeOne API emulation cannot satisfy frontend API requests.
- Chrome executable exists at `C:\Program Files\Google\Chrome\Application\chrome.exe`.

## Root Cause
确认结果：白屏风险来自两个叠加问题。

1. 开发/预览环境不带 EdgeOne Functions 时，`/api/*` 请求由 Vite SPA fallback 接管，返回 HTML 而不是 JSON。证据：`/api/random?format=json` 在 dev 和 preview 中均返回 `<!doctype html>`。
2. 上一次 UI 改造后，Hero 首屏把 `/api/random` 作为背景图的唯一来源；当 API 不可用、返回 HTML 或图片加载失败时，首屏大图不可见，用户容易感知为白屏/空白首屏。
3. 应用入口没有根级渲染兜底。若 React 初始化阶段出现同步异常，`#root` 会保持空内容，浏览器只显示白屏。

已排除或降低优先级：生产构建资源缺失、HTML 根节点缺失、CSS 构建失败。证据：build 通过，dist HTML、JS、CSS 均存在且 preview 下 200。

## Fix
- 为首页 Hero 增加稳定的静态兜底背景 `HERO_FALLBACK_IMAGE_URL`，不再把 `/api/random` 作为唯一首屏背景资源。
- Hero 挂载后再异步尝试通过 `fetchRandomImage()` 获取真实随机图；失败时保持兜底背景，避免 API 回退 HTML 或网络失败造成首屏视觉空白。
- 为 `src/main.tsx` 增加根级渲染兜底：当 `#root` 缺失或 React 初始化同步异常时，写入一个内联样式错误页，避免用户看到纯白屏。
- 扩展 `src/test/app-copy.test.ts`，覆盖兜底错误页和 Hero 不再依赖 API 作为唯一背景的约束。

## Verification
- `npm test -- src/test/app-copy.test.ts` passed: 4 tests, including fallback shell and Hero fallback background constraints.
- `npm test` passed: 2 test files, 39 tests.
- `npm run lint` passed.
- `npm run build` passed; production assets generated successfully.
- `npm run preview -- --host 127.0.0.1 --port 4173` started successfully.
- Preview HTTP checks:
  - `/` returned 200 HTML with root document.
  - `/assets/index-y3TT3lYZ.js` returned 200 JavaScript.
  - `/assets/index-D-xZMAH6.css` returned 200 CSS.
  - `/api/random?format=json` still returns SPA HTML under plain Vite preview, confirming this is an environment mismatch unless EdgeOne Functions/proxy is used. The frontend now tolerates this by keeping visible fallback Hero content.
- Browser automation limitation: Playwright bundled browsers are not installed in this environment; Chrome executable exists, but direct headless dump did not provide usable console capture through the available terminal output. Cross-browser runtime smoke must be completed in CI or a machine with Playwright browsers installed.
