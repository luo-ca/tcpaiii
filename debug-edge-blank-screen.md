# Debug Session: edge-blank-screen

Status: [OPEN]

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
- React 报告上述组件错误并建议添加 Error Boundary；最终 `react-dom.development.js:26962 Uncaught ReferenceError: Search is not defined` 导致根渲染失败。

## Fix
- 从 `index.html` 移除 `https://static.paiii.cn/static/gbts.js` 和 `disable-devtool-auto`，避免控制台被隐藏或干扰。
- 在 `src/App.tsx` 补齐 `Badge` 组件导入。
- 在 `src/App.tsx` 补齐 `Search` 图标导入。
- 在 `src/test/app-copy.test.ts` 增加回归测试，确保 `Badge`、`Search` 导入存在，并确保 gbts 脚本不会回归。

## Verification
- `npm test` 通过：2 个测试文件，40 个测试。
- `npm run lint` 通过。
- `npm run build` 通过，构建产物生成成功。
