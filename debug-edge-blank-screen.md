# Debug Session: edge-blank-screen

Status: [VERIFIED-CLOSED]

## Symptom
推送到 EdgeOne 后页面仍然白屏；用户要求先移除 `https://static.paiii.cn/static/gbts.js`，避免控制台不可见。

## Hypotheses
1. `gbts.js` 禁用或干扰开发者工具/控制台，掩盖真实 JS 异常；移除后可看到根因堆栈。
2. 生产环境首屏同步渲染异常仍未被兜底捕获，可能发生在 React 异步渲染阶段，而不是 `createRoot().render()` 同步调用阶段。
3. EdgeOne 部署资源路径或缓存仍指向旧 bundle，导致用户实际访问的不是最新修复产物。
4. 某个第三方资源或 Hero 兜底图片加载被阻塞，但页面结构应该仍显示文字；若完全白屏，更可能是 JS 运行时异常或 CSS 把内容隐藏。
5. `HERO_FALLBACK_IMAGE_URL` 使用外部生成图片接口，若被 CSP/网络策略拦截，应只影响背景，不应导致根节点空白。

## Evidence Log
- 已移除 `index.html` 中的 `https://static.paiii.cn/static/gbts.js` 和 `disable-devtool-auto`，控制台恢复可见。
- 用户提供控制台证据：`App.tsx:442 Uncaught ReferenceError: Search is not defined`，发生在 `<HeroSection>`。
- 用户提供控制台证据：`App.tsx:686 Uncaught ReferenceError: Badge is not defined`，发生在 `<OnlinePreview>`。
- 用户提供控制台证据：`ui-vendor-4-llqrT4.js:24 Uncaught ReferenceError: Input is not defined`，堆栈定位到 `index-DJju1oSo.js:164:8831`，发生在新版 Hero 搜索框渲染阶段。
- 这与上一轮 `Search`、`Badge` 属于同类问题：重设计 UI 使用了组件但未从对应模块导入。

## Fix
- 从 `index.html` 移除 `https://static.paiii.cn/static/gbts.js` 和 `disable-devtool-auto`，避免控制台被隐藏或干扰。
- 在 `src/App.tsx` 补齐 `Badge` 组件导入。
- 在 `src/App.tsx` 补齐 `Search` 图标导入。
- 在 `src/App.tsx` 补齐 `Input` 组件导入。
- 在 `src/test/app-copy.test.ts` 增加回归测试，确保 `Input`、`Badge`、`Search` 导入存在，并确保 gbts 脚本不会回归。

## Verification
- `npx tsc -p tsconfig.app.json --noEmit` 通过。
- `npm test` 通过：2 个测试文件，40 个测试。
- `npm run lint` 通过。
- `npm run build` 通过，构建产物生成成功。

---

## 后续核实（本轮）

本记录的部分结论已被后续决策推翻，逐条核对：

- **`App.tsx` 未导入符号**（`Search` / `Badge` / `Input`）：当前 `src/App.tsx` 已完全不引用这三个符号，相关渲染已下沉到 `src/components/sections/HeroSection.tsx` 等子组件，`tsc --noEmit` 通过，问题不复存在。
- **移除 `https://static.paiii.cn/static/gbts.js`**：确已移除，`index.html` 中不再出现。
- **移除 `https://imgs.paiii.cn/waf/gbts.js` 与 `disable-devtool-auto`**：此项已被推翻。后续 `6600d68 perf(html)` 明确改为 `defer` 并保留，理由写在 `index.html` 注释里：脚本必须能初始化 WAF 防调试，`defer` 已消除同步阻塞白屏风险（原先同步加载才是真隐患），并以 `document.querySelector("[disable-devtool-auto]")` 读自身配置，`defer` 时机反而更正确。该决定在 `P90` 时仍被保留。**不应再移除。**

结论：本记录除 gbts 一项判定反转外，其余修复均在位；反转项已在源码注释中留档理由。
